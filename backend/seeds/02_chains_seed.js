export const seed = async (knex) => {
  // Deletes ALL existing entries
  await knex("chains").del();
  await knex("chains").insert([
    {
      id: 1,
      symbol: "ETH",
      name: "Ethereum",
      native_currency: { name: "Ether", symbol: "ETH" },
      rpc_url: "https://eth.llamarpc.com",
      block_explorer: "https://etherscan.io",
    },
    {
      id: 2,
      symbol: "LSK",
      name: "Lisk",
      native_currency: { name: "Ether", symbol: "ETH" },
      rpc_url: "https://rpc.api.lisk.com",
      block_explorer: "https://blockscout.lisk.com",
    },
    {
      id: 3,
      symbol: "CORE",
      name: "Core DAO",
      native_currency: { name: "Core DAO Token", symbol: "CORE" },
      rpc_url: "https://rpc.coredao.org/",
      block_explorer: "https://scan.coredao.org",
    },
    {
      id: 4,
      symbol: "STRK",
      name: "Starknet",
      native_currency: { name: "STRK Token", symbol: "STRK" },
      rpc_url: "https://starknet-mainnet.g.alchemy.com/public",
      block_explorer: "https://starkscan.co",
    },
  ]);
};
