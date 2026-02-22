import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, PeriodEnum } from './dto/analytics-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/analytics/overview
   * Summary statistics + volume trend + top tokens + top chains in one call.
   */
  @Get('overview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Full analytics overview (summary + trends + breakdowns)' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated overview statistics',
    schema: {
      example: {
        overview: {
          totalVolume: 1250000.5,
          totalTransactions: 5420,
          averageValue: 230.55,
          successRate: 98.5,
          completedCount: 5339,
          pendingCount: 54,
          failedCount: 27,
        },
        volumeByPeriod: [
          { date: '2024-02-20', volume: 45000.0, count: 120 },
          { date: '2024-02-21', volume: 52000.0, count: 135 },
        ],
        topTokens: [
          { symbol: 'XLM', volume: 500000.0, count: 2500 },
          { symbol: 'USDC', volume: 400000.0, count: 1800 },
        ],
        topChains: [
          { chainId: 'stellar', chainName: 'Stellar', count: 3000, volume: 750000.0 },
        ],
      },
    },
  })
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(query);
  }

  /**
   * GET /api/analytics/volume?period=daily&from=2024-01-01&to=2024-12-31
   */
  @Get('volume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transaction volume aggregated by period' })
  @ApiQuery({ name: 'period', enum: PeriodEnum, required: false })
  @ApiQuery({ name: 'from', required: false, example: '2024-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2024-12-31' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        { date: '2024-02-20', volume: 45000.0, count: 120 },
        { date: '2024-02-21', volume: 52000.0, count: 135 },
      ],
    },
  })
  getVolume(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getVolume(query);
  }

  /**
   * GET /api/analytics/tokens
   */
  @Get('tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Top tokens by volume and transaction count' })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        { symbol: 'XLM', volume: 500000.0, count: 2500 },
        { symbol: 'USDC', volume: 400000.0, count: 1800 },
      ],
    },
  })
  getTokens(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getTokens(query);
  }

  /**
   * GET /api/analytics/chains
   */
  @Get('chains')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Top chains by transaction count and volume' })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        { chainId: 'stellar', chainName: 'Stellar', count: 3000, volume: 750000.0 },
        { chainId: 'ethereum', chainName: 'Ethereum', count: 1500, volume: 400000.0 },
      ],
    },
  })
  getChains(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getChains(query);
  }
}
