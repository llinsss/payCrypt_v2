export interface DashboardSummary {
  total_balance: number;
  total_deposit: number;
  total_withdrawal: number;
  portfolio_growth: number;
}

export interface UserTokenBalance {
  id: number;
  user_id: number;
  token_id: number;
  amount: string;
  usd_value: string;
  address: string | null;
  auto_convert_threshold?: string | null;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_tag: string;
  token_name: string;
  token_symbol: string;
  token_logo_url: string;
  token_price: string;
}

export interface UserTransaction {
  id: number;
  user_id: number;
  token_id: number;
  chain_id: number;
  reference: string;
  type: string;
  status: string;
  tx_hash: string;
  usd_value: string;
  amount: string;
  timestamp: string;
  from_address: string;
  to_address: string;
  description: string | null;
  extra: string | null;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_tag: string;
  token_name: string;
  token_symbol: string;
  token_logo_url: string;
  token_price: string;
  chain_name: string;
  chain_symbol: string;
}
