import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './CacheService';
import { Balance } from '../entities/Balance';

const BALANCE_KEY = (userId: string, chainId: string | number) =>
  `balance:${userId}:${chainId}`;

const BALANCE_PATTERN = (userId: string, chainId?: string | number) =>
  `balance:${userId}:${chainId ?? '*'}`;

const TOP_USERS_KEY = 'cache:warming:top-users';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  // ── Read ───────────────────────────────────────────────────────────────────

  async getBalance(userId: string, chainId: number): Promise<Balance> {
    const key = BALANCE_KEY(userId, chainId);

    // 1. Try cache
    const cached = await this.cacheService.get<Balance>(key, 'balance');
    if (cached) {
      this.logger.debug(`Cache HIT  balance:${userId}:${chainId}`);
      return cached;
    }

    // 2. Cache miss → query DB
    this.logger.debug(`Cache MISS balance:${userId}:${chainId}`);
    const balance = await this.balanceRepo.findOneOrFail({
      where: { userId, chainId },
    });

    // 3. Populate cache (fire-and-forget, don't block response)
    const ttl = this.configService.get<number>('BALANCE_CACHE_TTL', 60);
    this.cacheService.set(key, balance, ttl).catch((err) =>
      this.logger.warn(`Failed to cache balance: ${err.message}`),
    );

    return balance;
  }

  // ── Mutations (with cache invalidation) ───────────────────────────────────

  async deposit(userId: string, chainId: number, amount: bigint): Promise<Balance> {
    const balance = await this.applyBalanceDelta(userId, chainId, amount);
    await this.invalidateBalanceCache(userId, chainId);
    return balance;
  }

  async withdraw(userId: string, chainId: number, amount: bigint): Promise<Balance> {
    const balance = await this.applyBalanceDelta(userId, chainId, -amount);
    await this.invalidateBalanceCache(userId, chainId);
    return balance;
  }

  async transfer(
    fromUserId: string,
    toUserId: string,
    chainId: number,
    amount: bigint,
  ): Promise<{ from: Balance; to: Balance }> {
    const [from, to] = await Promise.all([
      this.applyBalanceDelta(fromUserId, chainId, -amount),
      this.applyBalanceDelta(toUserId, chainId, amount),
    ]);

    // Invalidate both sides concurrently
    await Promise.all([
      this.invalidateBalanceCache(fromUserId, chainId),
      this.invalidateBalanceCache(toUserId, chainId),
    ]);

    return { from, to };
  }

  // ── Cache management ──────────────────────────────────────────────────────

  /**
   * Invalidate cached balance(s) for a user.
   * If chainId is omitted, invalidates all chains for that user.
   */
  async invalidateBalanceCache(userId: string, chainId?: number): Promise<void> {
    const pattern = BALANCE_PATTERN(userId, chainId);
    await this.cacheService.invalidate(pattern);
  }

  /**
   * Warm cache for the top N most active users.
   * Designed to be called by a scheduled job (e.g. @Cron).
   */
  async warmTopUsersCache(limit = 1000): Promise<void> {
    this.logger.log(`Starting cache warming for top ${limit} users…`);

    // Fetch top users by activity (adjust query to your schema)
    const topBalances = await this.balanceRepo
      .createQueryBuilder('b')
      .orderBy('b.lastActivityAt', 'DESC')
      .take(limit)
      .getMany();

    const ttl = this.configService.get<number>('BALANCE_CACHE_TTL', 60);
    const entries = topBalances.map((b) => ({
      key: BALANCE_KEY(b.userId, b.chainId),
      value: b,
      ttl,
    }));

    await this.cacheService.warmBatch(entries);
    this.logger.log(`Cache warming complete – ${entries.length} entries written`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async applyBalanceDelta(
    userId: string,
    chainId: number,
    delta: bigint,
  ): Promise<Balance> {
    // Use a transaction with optimistic locking if needed
    return this.balanceRepo.manager.transaction(async (em) => {
      const balance = await em.findOneOrFail(Balance, { where: { userId, chainId } });
      balance.amount = (BigInt(balance.amount) + delta).toString();
      return em.save(balance);
    });
  }
}
