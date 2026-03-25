export interface OverviewStats {
  totalVolume: number;
  totalTransactions: number;
  averageValue: number;
  successRate: number;
  pendingCount: number;
  failedCount: number;
  completedCount: number;
}

export interface VolumeDataPoint {
  date: string;
  volume: number;
  count: number;
}

export interface TokenStat {
  symbol: string;
  volume: number;
  count: number;
}

export interface ChainStat {
  chainId: string;
  chainName: string;
  count: number;
  volume: number;
}

export interface OverviewResponse {
  overview: OverviewStats;
  volumeByPeriod: VolumeDataPoint[];
  topTokens: TokenStat[];
  topChains: ChainStat[];
}
