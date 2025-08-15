export const seed = async (knex) => {
  // Deletes ALL existing entries
  await knex("tokens").del();
  await knex("tokens").insert([
    {
      address: null,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      logo_url: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
      chain: "Ethereum",
      price: 4761.22,
    },
    {
      address: null,
      symbol: "LSK",
      name: "Lisk",
      decimals: 8,
      logo_url: "https://cryptologos.cc/logos/lisk-lsk-logo.png?v=040",
      chain: "Lisk",
      price: 0.42895,
    },
    {
      address: null,
      symbol: "CORE",
      name: "Core DAO Token",
      decimals: 18,
      logo_url: "https://cryptologos.cc/logos/core-dao-core-logo.png?v=040",
      chain: "Core (EVM-compatible)",
      price: 8065.6,
    },
    {
      address: null,
      symbol: "STRK",
      name: "Starknet Token",
      decimals: 18,
      logo_url:
        "https://cryptologos.cc/logos/starknet-token-strk-logo.png?v=040",
      chain: "Starknet (Ethereum L2)",
      price: 0.143654,
    },
  ]);
};
