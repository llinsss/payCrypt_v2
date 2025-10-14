INSERT INTO
  `railway`.`chains`
VALUES
  (
    1,
    'Starknet',
    'STRK',
    'https://starknet-mainnet.g.alchemy.com/public',
    'https://starkscan.co',
    '{\"name\":\"Starknet Token\",\"symbol\":\"STRK\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    2,
    'Lisk',
    'LSK',
    'https://rpc.api.lisk.com',
    'https://blockscout.lisk.com',
    '{\"name\":\"Lisk\",\"symbol\":\"LSK\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    3,
    'Base',
    'BASE',
    'https://mainnet.base.org',
    'https://basescan.org',
    '{\"name\":\"Ether\",\"symbol\":\"ETH\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    4,
    'Flow',
    'FLOW',
    'https://rest-mainnet.onflow.org',
    'https://flowscan.org',
    '{\"name\":\"Flow Token\",\"symbol\":\"FLOW\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    5,
    'U2U',
    'U2U',
    'https://rpc-mainnet.u2u.xyz',
    'https://u2uscan.xyz',
    '{\"name\":\"U2U Network\",\"symbol\":\"U2U\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  );

INSERT INTO
  `railway`.`tokens`
VALUES
  (
    1,
    '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766',
    'STRK',
    'Starknet',
    18,
    'strk.svg',
    'Starknet (Ethereum L2)',
    0.12470000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    2,
    'native',
    'LSK',
    'Lisk',
    8,
    'lsk.svg',
    'Lisk',
    0.24200000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    3,
    '0x4200000000000000000000000000000000000006',
    'BASE',
    'Base',
    18,
    'base.svg',
    'Base (Ethereum L2)',
    0.86025000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    4,
    'native',
    'FLOW',
    'Flow',
    8,
    'flow.svg',
    'Flow',
    0.29100000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    5,
    '0x558e7139800f8bc119f68d23a6126fffd43a66a6',
    'U2U',
    'U2U Network',
    18,
    'u2u.png',
    'U2U Solaris Mainnet',
    0.02130000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57'
  );