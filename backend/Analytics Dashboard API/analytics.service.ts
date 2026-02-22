import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, SelectQueryBuilder } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { AnalyticsQueryDto, PeriodEnum } from './dto/analytics-query.dto';
import {
  OverviewResponse,
  OverviewStats,
  VolumeDataPoint,
  TokenStat,
  ChainStat,
} from './interfaces/analytics.interface';

// ---------------------------------------------------------------------------
// These are placeholder entity imports – replace with your actual entities.
// ---------------------------------------------------------------------------
// import { Transaction } from '../transactions/entities/transaction.entity';

const CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    // @InjectRepository(Transaction)
    // private readonly transactionRepo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Public API methods
  // ─────────────────────────────────────────────────────────────────────────

  /** GET /api/analytics/overview */
  async getOverview(query: AnalyticsQueryDto): Promise<OverviewResponse> {
    const cacheKey = this.buildCacheKey('overview', query);
    const cached = await this.getFromCache<OverviewResponse>(cacheKey);
    if (cached) return cached;

    const [overview, volumeByPeriod, topTokens, topChains] = await Promise.all([
      this.computeOverviewStats(query),
      this.computeVolumeByPeriod(query),
      this.computeTopTokens(query),
      this.computeTopChains(query),
    ]);

    const result: OverviewResponse = { overview, volumeByPeriod, topTokens, topChains };
    await this.setCache(cacheKey, result);
    return result;
  }

  /** GET /api/analytics/volume */
  async getVolume(query: AnalyticsQueryDto): Promise<VolumeDataPoint[]> {
    const cacheKey = this.buildCacheKey('volume', query);
    const cached = await this.getFromCache<VolumeDataPoint[]>(cacheKey);
    if (cached) return cached;

    const result = await this.computeVolumeByPeriod(query);
    await this.setCache(cacheKey, result);
    return result;
  }

  /** GET /api/analytics/tokens */
  async getTokens(query: AnalyticsQueryDto): Promise<TokenStat[]> {
    const cacheKey = this.buildCacheKey('tokens', query);
    const cached = await this.getFromCache<TokenStat[]>(cacheKey);
    if (cached) return cached;

    const result = await this.computeTopTokens(query);
    await this.setCache(cacheKey, result);
    return result;
  }

  /** GET /api/analytics/chains */
  async getChains(query: AnalyticsQueryDto): Promise<ChainStat[]> {
    const cacheKey = this.buildCacheKey('chains', query);
    const cached = await this.getFromCache<ChainStat[]>(cacheKey);
    if (cached) return cached;

    const result = await this.computeTopChains(query);
    await this.setCache(cacheKey, result);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Computation helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async computeOverviewStats(query: AnalyticsQueryDto): Promise<OverviewStats> {
    const { fromDate, toDate } = this.parseDateRange(query);

    const qb = this.dataSource
      .createQueryBuilder()
      .select([
        'COALESCE(SUM(t.amount), 0)                                      AS "totalVolume"',
        'COUNT(t.id)                                                      AS "totalTransactions"',
        'COALESCE(AVG(t.amount), 0)                                      AS "averageValue"',
        `COUNT(t.id) FILTER (WHERE t.status = 'completed')               AS "completedCount"`,
        `COUNT(t.id) FILTER (WHERE t.status = 'pending')                 AS "pendingCount"`,
        `COUNT(t.id) FILTER (WHERE t.status = 'failed')                  AS "failedCount"`,
      ])
      .from('transactions', 't')
      .where('t.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate });

    this.applyUserFilter(qb, query.userId);

    const raw = await qb.getRawOne();

    const totalTransactions = Number(raw.totalTransactions) || 0;
    const completedCount = Number(raw.completedCount) || 0;
    const successRate =
      totalTransactions > 0
        ? parseFloat(((completedCount / totalTransactions) * 100).toFixed(2))
        : 0;

    return {
      totalVolume: parseFloat(Number(raw.totalVolume).toFixed(2)),
      totalTransactions,
      averageValue: parseFloat(Number(raw.averageValue).toFixed(2)),
      successRate,
      completedCount,
      pendingCount: Number(raw.pendingCount) || 0,
      failedCount: Number(raw.failedCount) || 0,
    };
  }

  private async computeVolumeByPeriod(query: AnalyticsQueryDto): Promise<VolumeDataPoint[]> {
    const { fromDate, toDate } = this.parseDateRange(query);
    const truncFn = this.getTruncFunction(query.period ?? PeriodEnum.DAILY);

    const qb = this.dataSource
      .createQueryBuilder()
      .select([
        `DATE_TRUNC('${truncFn}', t.created_at)::date AS "date"`,
        'COALESCE(SUM(t.amount), 0)                   AS "volume"',
        'COUNT(t.id)                                  AS "count"',
      ])
      .from('transactions', 't')
      .where('t.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy(`DATE_TRUNC('${truncFn}', t.created_at)`)
      .orderBy(`DATE_TRUNC('${truncFn}', t.created_at)`, 'ASC');

    this.applyUserFilter(qb, query.userId);

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      date: this.formatDate(r.date, query.period ?? PeriodEnum.DAILY),
      volume: parseFloat(Number(r.volume).toFixed(2)),
      count: Number(r.count),
    }));
  }

  private async computeTopTokens(
    query: AnalyticsQueryDto,
    limit = 10,
  ): Promise<TokenStat[]> {
    const { fromDate, toDate } = this.parseDateRange(query);

    const qb = this.dataSource
      .createQueryBuilder()
      .select([
        't.token_symbol  AS "symbol"',
        'SUM(t.amount)   AS "volume"',
        'COUNT(t.id)     AS "count"',
      ])
      .from('transactions', 't')
      .where('t.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('t.token_symbol')
      .orderBy('"volume"', 'DESC')
      .limit(limit);

    this.applyUserFilter(qb, query.userId);

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      symbol: r.symbol,
      volume: parseFloat(Number(r.volume).toFixed(2)),
      count: Number(r.count),
    }));
  }

  private async computeTopChains(
    query: AnalyticsQueryDto,
    limit = 10,
  ): Promise<ChainStat[]> {
    const { fromDate, toDate } = this.parseDateRange(query);

    const qb = this.dataSource
      .createQueryBuilder()
      .select([
        't.chain_id      AS "chainId"',
        't.chain_name    AS "chainName"',
        'COUNT(t.id)     AS "count"',
        'SUM(t.amount)   AS "volume"',
      ])
      .from('transactions', 't')
      .where('t.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('t.chain_id, t.chain_name')
      .orderBy('"count"', 'DESC')
      .limit(limit);

    this.applyUserFilter(qb, query.userId);

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      chainId: r.chainId,
      chainName: r.chainName,
      count: Number(r.count),
      volume: parseFloat(Number(r.volume).toFixed(2)),
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────

  private parseDateRange(query: AnalyticsQueryDto): { fromDate: Date; toDate: Date } {
    const toDate = query.to ? new Date(query.to) : new Date();
    // Default from: 30 days back
    const fromDate = query.from
      ? new Date(query.from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Ensure toDate covers the entire day
    toDate.setHours(23, 59, 59, 999);
    fromDate.setHours(0, 0, 0, 0);

    return { fromDate, toDate };
  }

  private getTruncFunction(period: PeriodEnum): string {
    const map: Record<PeriodEnum, string> = {
      [PeriodEnum.DAILY]: 'day',
      [PeriodEnum.WEEKLY]: 'week',
      [PeriodEnum.MONTHLY]: 'month',
    };
    return map[period];
  }

  private formatDate(date: Date | string, period: PeriodEnum): string {
    const d = new Date(date);
    if (period === PeriodEnum.MONTHLY) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return d.toISOString().split('T')[0];
  }

  private applyUserFilter(qb: SelectQueryBuilder<any>, userId?: string): void {
    if (userId) {
      qb.andWhere('t.user_id = :userId', { userId });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cache helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildCacheKey(endpoint: string, query: AnalyticsQueryDto): string {
    const parts = [
      'analytics',
      endpoint,
      query.period ?? PeriodEnum.DAILY,
      query.from ?? 'noFrom',
      query.to ?? 'noTo',
      query.userId ?? 'global',
    ];
    return parts.join(':');
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      this.logger.debug(`Cache HIT: ${key}`);
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Cache GET error for key ${key}: ${err}`);
      return null;
    }
  }

  private async setCache<T>(key: string, value: T): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
      this.logger.debug(`Cache SET: ${key} (TTL ${CACHE_TTL_SECONDS}s)`);
    } catch (err) {
      this.logger.warn(`Cache SET error for key ${key}: ${err}`);
    }
  }
}
