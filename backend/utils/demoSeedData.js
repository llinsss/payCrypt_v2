export const DEMO_PASSWORD = "DemoPass123!";

export const DEMO_USERS = [
  { tag: "@demo_alice", email: "alice@demo.tagged.local", address: "0x0000000000000000000000000000000000000001", kyc_status: "verified" },
  { tag: "@demo_bola", email: "bola@demo.tagged.local", address: "0x0000000000000000000000000000000000000002", kyc_status: "pending" },
  { tag: "@demo_chidi", email: "chidi@demo.tagged.local", address: "0x0000000000000000000000000000000000000003", kyc_status: "none" },
  { tag: "@demo_dayo", email: "dayo@demo.tagged.local", address: "0x0000000000000000000000000000000000000004", kyc_status: "verified" },
  { tag: "@demo_eni", email: "eni@demo.tagged.local", address: "0x0000000000000000000000000000000000000005", kyc_status: "rejected" },
];
export const DEMO_CHAIN_SEEDS = [
  { id: 1, symbol: "STRK", name: "Starknet", native_currency: { name: "Starknet Token", symbol: "STRK" }, rpc_url: "https://starknet-mainnet.g.alchemy.com/public", block_explorer: "https://starkscan.co" },
  { id: 2, symbol: "LSK", name: "Lisk", native_currency: { name: "Lisk", symbol: "LSK" }, rpc_url: "https://rpc.api.lisk.com", block_explorer: "https://blockscout.lisk.com" },
  { id: 3, symbol: "BASE", name: "Base", native_currency: { name: "Ether", symbol: "ETH" }, rpc_url: "https://mainnet.base.org", block_explorer: "https://basescan.org" },
  { id: 4, symbol: "FLOW", name: "Flow", native_currency: { name: "Flow Token", symbol: "FLOW" }, rpc_url: "https://rest-mainnet.onflow.org", block_explorer: "https://flowscan.org" },
  { id: 5, symbol: "U2U", name: "U2U", native_currency: { name: "U2U Network", symbol: "U2U" }, rpc_url: "https://rpc-mainnet.u2u.xyz", block_explorer: "https://u2uscan.xyz" },
  { id: 6, symbol: "XLM", name: "Stellar", native_currency: { name: "Stellar Lumens", symbol: "XLM" }, rpc_url: "https://horizon.stellar.org", block_explorer: "https://stellar.expert/explorer/public" },
];

export const DEMO_TOKEN_SEEDS = [
  { id: 1, address: "0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766", symbol: "STRK", name: "Starknet", decimals: 18, logo_url: "strk.svg", chain: "Starknet", price: 0.143654 },
  { id: 2, address: "native", symbol: "LSK", name: "Lisk", decimals: 18, logo_url: "lsk.svg", chain: "Lisk", price: 0.42895 },
  { id: 3, address: "0x4200000000000000000000000000000000000006", symbol: "BASE", name: "Base", decimals: 18, logo_url: "base.svg", chain: "Base", price: 1 },
  { id: 4, address: "native", symbol: "FLOW", name: "Flow", decimals: 18, logo_url: "flow.svg", chain: "Flow", price: 0.45 },
  { id: 5, address: "0x558e7139800f8bc119f68d23a6126fffd43a66a6", symbol: "U2U", name: "U2U Network", decimals: 18, logo_url: "u2u.png", chain: "U2U", price: 0.0213 },
  { id: 6, address: "native", symbol: "XLM", name: "Stellar Lumens", decimals: 7, logo_url: "xlm.svg", chain: "Stellar", price: 0.09 },
];
