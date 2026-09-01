# Supported Blockchain Networks Configuration

This document provides a comprehensive guide to configuring and using all supported blockchain networks in Tagged.

## Network Overview

| Network | Type | Status | Native Token | Config Prefix |
|---------|------|--------|--------------|---------------|
| U2U Testnet | EVM | Active | U2U | U2U |
| Base Sepolia | EVM | Active | ETH | BASE |
| Flow Testnet | EVM | Active | FLOW | FLOW |
| Lisk Sepolia | EVM | Active | ETH | LISK |
| Ethereum Sepolia | EVM | Active | ETH | (uses RPC_URL) |
| Polygon Mumbai | EVM | Active | MATIC | POLYGON |
| Starknet Testnet | Cairo | Active | ETH | (separate config) |

## Configuration Template

For each EVM network, configure these environment variables:

```bash
# Replace {NETWORK} with: U2U, BASE, FLOW, LISK, POLYGON, etc.
{NETWORK}_NETWORK=testnet           # Network type
{NETWORK}_RPC_URL=https://...       # RPC endpoint
{NETWORK}_CONTRACT_ADDRESS=0x...    # Deployed contract
{NETWORK}_ACCOUNT_ADDRESS=0x...     # Transaction account
{NETWORK}_PRIVATE_KEY=0x...         # Signing key
```

## Detailed Network Configurations

### 1. U2U Network

**Testnet**
```bash
U2U_NETWORK=testnet
U2U_RPC_URL=https://rpc-testnet.u2u.xyz
U2U_CONTRACT_ADDRESS=0x<deployed_contract_address>
U2U_ACCOUNT_ADDRESS=0x<your_account_address>
U2U_PRIVATE_KEY=0x<your_private_key>
```

**Mainnet**
```bash
U2U_NETWORK=mainnet
U2U_RPC_URL=https://rpc.u2u.xyz
U2U_CONTRACT_ADDRESS=0x<deployed_contract_address>
U2U_ACCOUNT_ADDRESS=0x<your_account_address>
U2U_PRIVATE_KEY=0x<your_private_key>
```

**Details**
- Chain ID: 6868 (testnet), 39397 (mainnet)
- Block Explorer: https://testnet.u2uscan.xyz
- Faucet: https://testnet-faucet.u2u.xyz
- Gas Token: U2U

### 2. Base Network

**Testnet (Sepolia)**
```bash
BASE_NETWORK=testnet
BASE_RPC_URL=https://sepolia.base.org
BASE_CONTRACT_ADDRESS=0x<deployed_contract_address>
BASE_ACCOUNT_ADDRESS=0x<your_account_address>
BASE_PRIVATE_KEY=0x<your_private_key>
```

**Mainnet**
```bash
BASE_NETWORK=mainnet
BASE_RPC_URL=https://mainnet.base.org
BASE_CONTRACT_ADDRESS=0x<deployed_contract_address>
BASE_ACCOUNT_ADDRESS=0x<your_account_address>
BASE_PRIVATE_KEY=0x<your_private_key>
```

**Details**
- Chain ID: 84532 (testnet), 8453 (mainnet)
- Block Explorer: https://sepolia.basescan.org
- Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- Gas Token: ETH

### 3. Flow Network

**Testnet (EVM)**
```bash
FLOW_NETWORK=testnet
FLOW_RPC_URL=https://testnet.evm.nodes.onflow.org
FLOW_CONTRACT_ADDRESS=0x<deployed_contract_address>
FLOW_ACCOUNT_ADDRESS=0x<your_account_address>
FLOW_PRIVATE_KEY=0x<your_private_key>
```

**Mainnet**
```bash
FLOW_NETWORK=mainnet
FLOW_RPC_URL=https://mainnet.evm.nodes.onflow.org
FLOW_CONTRACT_ADDRESS=0x<deployed_contract_address>
FLOW_ACCOUNT_ADDRESS=0x<your_account_address>
FLOW_PRIVATE_KEY=0x<your_private_key>
```

**Details**
- Chain ID: 545 (testnet), 747 (mainnet)
- Block Explorer: https://evm-testnet.flowscan.io
- Gas Token: FLOW

### 4. Lisk Network

**Testnet (Sepolia)**
```bash
LISK_NETWORK=testnet
LISK_RPC_URL=https://rpc.sepolia-api.lisk.com
LISK_CONTRACT_ADDRESS=0x<deployed_contract_address>
LISK_ACCOUNT_ADDRESS=0x<your_account_address>
LISK_PRIVATE_KEY=0x<your_private_key>
```

**Mainnet**
```bash
LISK_NETWORK=mainnet
LISK_RPC_URL=https://rpc-api.lisk.com
LISK_CONTRACT_ADDRESS=0x<deployed_contract_address>
LISK_ACCOUNT_ADDRESS=0x<your_account_address>
LISK_PRIVATE_KEY=0x<your_private_key>
```

**Details**
- Chain ID: 4202 (testnet), 1135 (mainnet)
- Block Explorer: https://sepolia-blockscout.lisk.com
- Gas Token: ETH

### 5. Polygon Network

**Mumbai Testnet**
```bash
POLYGON_NETWORK=testnet
POLYGON_RPC_URL=https://rpc-mumbai.maticvigil.com
POLYGON_CONTRACT_ADDRESS=0x<deployed_contract_address>
POLYGON_ACCOUNT_ADDRESS=0x<your_account_address>
POLYGON_PRIVATE_KEY=0x<your_private_key>
```

**Mainnet**
```bash
POLYGON_NETWORK=mainnet
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_CONTRACT_ADDRESS=0x<deployed_contract_address>
POLYGON_ACCOUNT_ADDRESS=0x<your_account_address>
POLYGON_PRIVATE_KEY=0x<your_private_key>
```

**Details**
- Chain ID: 80001 (Mumbai), 137 (Mainnet)
- Block Explorer: https://mumbai.polygonscan.com
- Gas Token: MATIC

## Network Selection in API Calls

When making transaction requests, specify the chain:

```bash
# Send transaction on U2U
POST /api/v1/transactions/send-to-tag
{
  "receiver_tag": "@jane_smith",
  "amount": 100,
  "balance_id": 123,
  "chain": "u2u"  # Specify network here
}

# Send transaction on Base
POST /api/v1/transactions/send-to-tag
{
  "receiver_tag": "@jane_smith",
  "amount": 100,
  "balance_id": 123,
  "chain": "base"  # Specify network here
}
```

## Account Setup

### Prerequisites

1. **Generate Account**
   ```bash
   # Using ethers.js
   const wallet = ethers.Wallet.createRandom();
   console.log("Address:", wallet.address);
   console.log("Private Key:", wallet.privateKey);
   ```

2. **Fund Account**
   - Get testnet tokens from faucet
   - Ensure sufficient balance for gas

3. **Store Securely**
   - Use environment variables
   - Never commit to version control
   - Use secrets management in production

## Smart Contract Deployment

For each network, deploy the Tagged smart contract:

```bash
# Using Hardhat (example)
npx hardhat run scripts/deploy.js --network u2u-testnet
```

Then update the configuration with the deployed contract address.

## Testing Checklist

For each network configured:

- [ ] RPC connection test
- [ ] Account balance verification
- [ ] Contract deployment verification
- [ ] Tag registration test
- [ ] Balance query test
- [ ] Transaction test
- [ ] Block explorer verification

## Monitoring

### Balance Polling

The system automatically polls balances for configured networks:

```bash
# Check worker logs
docker logs <tagged-backend-container> | grep -i balance
```

### Transaction Confirmation

Monitor transaction confirmations:

```bash
# Check transaction worker
docker logs <tagged-backend-container> | grep -i confirmation
```

### Alerts

Configure alerts for:
- RPC connection failures
- Circuit breaker triggers
- Transaction failures
- Balance anomalies

## Performance Metrics

| Network | Avg Block Time | Confirmation Time | Gas Cost (relative) |
|---------|---|---|---|
| U2U | ~2s | ~26s | Low |
| Base | ~2s | ~12s | Medium |
| Flow | ~3s | ~10s | Low |
| Lisk | ~4s | ~15s | Low |
| Polygon | ~2s | ~128s | Very Low |
| Ethereum | ~12s | ~15m | Very High |

## Cost Estimation

Use this to estimate transaction costs:

```javascript
// Base: 21,000 gas * 0.05 gwei = 1,050 gwei (~$0.03)
// U2U: 21,000 gas * 0.1 gwei = 2,100 gwei (~$0.001)
// Polygon: 21,000 gas * 30 gwei = 630,000 gwei (~$0.0005)
```

## Troubleshooting

### Network Not Responding

```bash
# Test RPC connectivity
curl -X POST <RPC_URL> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### Insufficient Gas

```bash
# Check account balance
curl -X POST <RPC_URL> \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getBalance",
    "params":["<ACCOUNT_ADDRESS>","latest"],
    "id":1
  }'
```

### Contract Errors

- Verify contract address on block explorer
- Check contract deployment on correct network
- Ensure contract ABI matches
- Review contract error logs

## Additional Resources

- Ethers.js Documentation: https://docs.ethers.org
- EVM Specification: https://ethereum.org/en/developers/docs/evm
- Network-specific docs:
  - U2U: https://docs.u2u.xyz
  - Base: https://docs.base.org
  - Flow: https://developers.flow.com/evm
  - Lisk: https://docs.lisk.com

## Support

For network-specific issues:
1. Check network documentation
2. Test with block explorer
3. Review system logs
4. Contact network support team
