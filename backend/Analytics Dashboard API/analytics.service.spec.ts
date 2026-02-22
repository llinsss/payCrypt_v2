import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { getRedisToken } from '@nestjs-modules/ioredis';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, PeriodEnum } from './dto/analytics-query.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMockQb(rawOneResult: any, rawManyResult: any[] = []) {
  const qb: Partial<SelectQueryBuilder<any>> = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawOneResult),
    getRawMany: jest.fn().mockResolvedValue(rawManyResult),
  };
  return qb as SelectQueryBuilder<any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let dataSource: jest.Mocked<DataSource>;
  let redis: { get: jest.Mock; set: jest.Mock };

  const defaultQuery: AnalyticsQueryDto = {
    from: '2024-01-01',
    to: '2024-12-31',
    period: PeriodEnum.DAILY,
  };

  beforeEach(async () => {
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };

    dataSource = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRedisToken(), useValue: redis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  // ── Cache ─────────────────────────────────────────────────────────────────

  describe('caching', () => {
    it('should return cached result on cache hit', async () => {
      const cached = { overview: { totalVolume: 999 } };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getOverview(defaultQuery);

      expect(result).toEqual(cached);
      expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should store result in cache on cache miss', async () => {
      const overviewRaw = {
        totalVolume: '1250000.50',
        totalTransactions: '5420',
        averageValue: '230.55',
        completedCount: '5339',
        pendingCount: '54',
        failedCount: '27',
      };
      const qb = buildMockQb(overviewRaw, []);
      dataSource.createQueryBuilder.mockReturnValue(qb);

      await service.getOverview(defaultQuery);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('analytics:overview'),
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should build different cache keys for different queries', async () => {
      const query1: AnalyticsQueryDto = { from: '2024-01-01', to: '2024-06-30', period: PeriodEnum.DAILY };
      const query2: AnalyticsQueryDto = { from: '2024-07-01', to: '2024-12-31', period: PeriodEnum.DAILY };

      const key1 = (service as any).buildCacheKey('overview', query1) as string;
      const key2 = (service as any).buildCacheKey('overview', query2) as string;

      expect(key1).not.toEqual(key2);
    });

    it('should differentiate user-specific vs global cache keys', () => {
      const globalKey = (service as any).buildCacheKey('tokens', defaultQuery) as string;
      const userKey = (service as any).buildCacheKey('tokens', { ...defaultQuery, userId: 'user-123' }) as string;
      expect(globalKey).not.toEqual(userKey);
    });
  });

  // ── Volume calculations ───────────────────────────────────────────────────

  describe('computeOverviewStats (volume calculations)', () => {
    function setupMock(raw: Record<string, string>) {
      const qb = buildMockQb(raw, []);
      dataSource.createQueryBuilder.mockReturnValue(qb);
    }

    it('should calculate success rate correctly', async () => {
      setupMock({
        totalVolume: '1000000',
        totalTransactions: '1000',
        averageValue: '1000',
        completedCount: '985',
        pendingCount: '10',
        failedCount: '5',
      });

      const result = await (service as any).computeOverviewStats(defaultQuery);
      expect(result.successRate).toBe(98.5);
    });

    it('should return 0 success rate when no transactions', async () => {
      setupMock({
        totalVolume: '0',
        totalTransactions: '0',
        averageValue: '0',
        completedCount: '0',
        pendingCount: '0',
        failedCount: '0',
      });

      const result = await (service as any).computeOverviewStats(defaultQuery);
      expect(result.successRate).toBe(0);
      expect(result.totalTransactions).toBe(0);
    });

    it('should round volume to 2 decimal places', async () => {
      setupMock({
        totalVolume: '12345.6789',
        totalTransactions: '100',
        averageValue: '123.456789',
        completedCount: '100',
        pendingCount: '0',
        failedCount: '0',
      });

      const result = await (service as any).computeOverviewStats(defaultQuery);
      expect(result.totalVolume).toBe(12345.68);
      expect(result.averageValue).toBe(123.46);
    });
  });

  // ── Aggregation by period ─────────────────────────────────────────────────

  describe('computeVolumeByPeriod', () => {
    it('should aggregate by day', async () => {
      const rows = [
        { date: new Date('2024-02-20'), volume: '45000', count: '120' },
        { date: new Date('2024-02-21'), volume: '52000', count: '135' },
      ];
      const qb = buildMockQb(null, rows);
      dataSource.createQueryBuilder.mockReturnValue(qb);

      const result = await (service as any).computeVolumeByPeriod({
        ...defaultQuery,
        period: PeriodEnum.DAILY,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: '2024-02-20', volume: 45000, count: 120 });
      expect(result[1]).toMatchObject({ date: '2024-02-21', volume: 52000, count: 135 });
    });

    it('should format monthly dates as YYYY-MM', async () => {
      const rows = [{ date: new Date('2024-03-01'), volume: '100000', count: '500' }];
      const qb = buildMockQb(null, rows);
      dataSource.createQueryBuilder.mockReturnValue(qb);

      const result = await (service as any).computeVolumeByPeriod({
        ...defaultQuery,
        period: PeriodEnum.MONTHLY,
      });

      expect(result[0].date).toBe('2024-03');
    });

    it('should use "week" trunc for weekly period', async () => {
      const qb = buildMockQb(null, []);
      dataSource.createQueryBuilder.mockReturnValue(qb);

      await (service as any).computeVolumeByPeriod({ ...defaultQuery, period: PeriodEnum.WEEKLY });

      // Verify the select call included 'week' truncation
      expect((qb.select as jest.Mock).mock.calls[0][0]).toEqual(
        expect.arrayContaining([expect.stringContaining("'week'")]),
      );
    });
  });

  // ── Date range filtering ──────────────────────────────────────────────────

  describe('date range filtering', () => {
    it('should default to last 30 days when no dates provided', () => {
      const { fromDate, toDate } = (service as any).parseDateRange({});
      const diffMs = toDate.getTime() - fromDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it('should parse explicit date range correctly', () => {
      const { fromDate, toDate } = (service as any).parseDateRange({
        from: '2024-01-01',
        to: '2024-03-31',
      });
      expect(fromDate.getFullYear()).toBe(2024);
      expect(fromDate.getMonth()).toBe(0); // January
      expect(toDate.getMonth()).toBe(2);   // March
    });

    it('should apply userId filter when provided', () => {
      const qb = buildMockQb(null, []);
      (service as any).applyUserFilter(qb, 'user-abc');
      expect((qb.andWhere as jest.Mock)).toHaveBeenCalledWith(
        't.user_id = :userId',
        { userId: 'user-abc' },
      );
    });

    it('should NOT apply userId filter when not provided', () => {
      const qb = buildMockQb(null, []);
      (service as any).applyUserFilter(qb, undefined);
      expect((qb.andWhere as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  // ── Top tokens / chains ───────────────────────────────────────────────────

  describe('computeTopTokens', () => {
    it('should return tokens sorted by volume', async () => {
      const rows = [
        { symbol: 'XLM', volume: '500000', count: '2500' },
        { symbol: 'USDC', volume: '400000', count: '1800' },
      ];
      const qb = buildMockQb(null, rows);
      dataSource.createQueryBuilder.mockReturnValue(qb);

      const result = await (service as any).computeTopTokens(defaultQuery);
      expect(result[0].symbol).toBe('XLM');
      expect(result[0].volume).toBe(500000);
      expect(result[0].count).toBe(2500);
    });
  });

  describe('computeTopChains', () => {
    it('should return chains with correct shape', async () => {
      const rows = [{ chainId: 'stellar', chainName: 'Stellar', count: '3000', volume: '750000' }];
      const qb = buildMockQb(null, rows);
      dataSource.createQueryBuilder.mockReturnValue(qb);

      const result = await (service as any).computeTopChains(defaultQuery);
      expect(result[0]).toMatchObject({
        chainId: 'stellar',
        chainName: 'Stellar',
        count: 3000,
        volume: 750000,
      });
    });
  });
});
