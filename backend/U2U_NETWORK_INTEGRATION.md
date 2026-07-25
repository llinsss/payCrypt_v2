# U2U Network Integration Guide

This document describes the U2U Network integration in the Tagged backend, which enables transactions, balance queries, and tag management on the U2U blockchain network.

## Overview

U2U (UniqueOne) is an EVM-compatible blockchain network that is fully supported by Tagged's multi-chain transaction infrastructure. The backend reuses ethers.js with the U2U RPC endpoint for all blockchain operations.

## Supported EVM Networks

The Tagged backend supports the following EVM-compatible networks through a unified interface:

- **U2U Network** (Primary focus of this integration)
- **Base** (Coinbase Layer 2)
- **Flow EVM** (Flow blockchain EVM bridge)
- **Lisk** (L2 solution on Ethereum)
- **Polygon** (Layer 2 on Ethereum)
- **Ethereum** (Mainnet/Testnet)

## Environment Configuration

### U2U Network Setup

Add the following environment variables to your `.env` file:

```bash
# U2U Network Configuration
U2U_NETWORK=testnet          # Network: testnet or mainnet
U2U_RPC_URL=https://rpc-testnet.u2u.xyz
U2U_CONTRACT_ADDRESS=0x...  # Contract address for tag management
U2U_ACCOUNT_ADDRESS=0x...   # Account address for transactions
U2U_PRIVATE_KEY=0x...       # Private key for signing transactions
```

### U2U Testnet Details

- **Network Name:** U2U Testnet
- **RPC URL:** `https://rpc-testnet.u2u.xyz`
- **Chain ID:** 6868
- **Currency:** U2U (testnet)
- **Block Explorer:** https://testnet.u2uscan.xyz

### U2U Mainnet Details

- **Network Name:** U2U Mainnet
- **RPC URL:** `https://rpc.u2u.xyz`
- **Chain ID:** 39397
- **Currency:** U2U
- **Block Explorer:** https://u2uscan.xyz

## Architecture

### Chain Router

The backend uses a unified EVM chain router (`/backend/contracts/evm.js`) that:

1. **Dynamic Configuration:** Reads chain-specific environment variables
2. **Provider Setup:** Creates ethers.js provider for each chain's RPC endpoint
3. **Contract Interaction:** Instantiates contract with chain-specific ABI
4. **Circuit Breaker:** Protects against cascading failures with circuit breaker pattern

### Configuration Pattern

For any EVM chain (including U2U), the system follows this pattern:

```javascript
// Environment Variables
${CHAIN_NAME}_NETWORK        // Network type (testnet/mainnet)
${CHAIN_NAME}_RPC_URL        // RPC endpoint URL
${CHAIN_NAME}_CONTRACT_ADDRESS  // Smart contract address
${CHAIN_NAME}_ACCOUNT_ADDRESS   // Account address
${CHAIN_NAME}_PRIVATE_KEY       // Account private key
```

### Code Integration

U2U is integrated into the existing transaction routing system:

1. **Service Layer** (`/backend/contracts/services/evm.js`)
   - `createTagAddress(chain, tag)` - Register tag on U2U
   - `getTagAddress(chain, tag)` - Resolve tag to address
   - `getTagBalance(chain, tag)` - Query balance
   - `sendToTag()` - Transfer between tags
   - `sendToWallet()` - Transfer to external wallet

2. **Balance Polling** (`/backend/workers/balancePolling.js`)
   - Includes U2U in periodic balance updates
   - Monitors tag balances across all chains

3. **Transaction Processing** (`/backend/queues/transactionConfirmation.js`)
   - Handles U2U transaction confirmation
   - Tracks transaction status until finality

## Usage Examples

### Create Tag on U2U

```javascript
import * as evm from "../contracts/services/evm.js";

const tagAddress = await evm.createTagAddress("u2u", "john_doe");
console.log("Tag registered at:", tagAddress);
```

### Get Tag Address

```javascript
const address = await evm.getTagAddress("u2u", "john_doe");
console.log("Tag address:", address);
```

### Get Tag Balance

```javascript
const balance = await evm.getTagBalance("u2u", "john_doe");
console.log("Balance:", balance); // Returns in U2U decimal format
```

### Send Transaction to Tag

```javascript
const txHash = await evm.sendToTag({
  chain: "u2u",
  sender_tag: "john_doe",
  receiver_tag: "jane_smith",
  amount: 10.5,
});
console.log("Transaction:", txHash);
```

## API Endpoints

U2U transactions are handled through the existing transaction endpoints:

### Send to Tag

**Endpoint:** `POST /api/v1/transactions/send-to-tag`

**Request:**
```json
{
  "receiver_tag": "@jane_smith",
  "amount": 10.5,
  "balance_id": 123,
  "chain": "u2u"
}
```

**Response:**
```json
{
  "success": true,
  "tx_hash": "0x...",
  "status": "pending"
}
```

### Get Balance

**Endpoint:** `GET /api/v1/balances/:id`

**Response includes U2U balance if configured:**
```json
{
  "id": 123,
  "chain": "u2u",
  "balance": "150.75",
  "last_updated": "2024-01-20T10:30:00Z"
}
```

## Smart Contract Integration

The Tagged smart contract must be deployed on U2U testnet for transaction functionality. The contract should support:

1. **Tag Registration:** `register(tag)` - Creates a new tag
2. **Tag Resolution:** `getTagAddress(tag)` - Returns the associated wallet address
3. **Balance Queries:** `getTagBalance(tag, token)` - Returns account balance
4. **Deposits:** `deposit(toTag, fromTag, token, amount)` - Transfer between tags
5. **Withdrawals:** `withdrawFromWallet(address, amount, tag, token)` - Withdraw to external address

## Testing

### 1. Verify RPC Connection

```bash
curl -X POST https://rpc-testnet.u2u.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

Expected response: `"0x1ad4"` (6868 in decimal)

### 2. Check Account Balance

```bash
curl -X POST https://rpc-testnet.u2u.xyz \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getBalance",
    "params":["0x...", "latest"],
    "id":1
  }'
```

### 3. Test Transaction Flow

1. Create a test tag on U2U
2. Query the tag address
3. Send a small test transaction
4. Verify on block explorer: https://testnet.u2uscan.xyz

## Monitoring

### Balance Polling Worker

The balance polling worker (`/backend/workers/balancePolling.js`) automatically:
- Polls U2U balances on configured schedule
- Updates balance cache in Redis
- Triggers notifications on significant changes

### Transaction Confirmation Worker

The transaction confirmation worker:
- Monitors pending U2U transactions
- Updates transaction status
- Handles confirmations and failures

### Circuit Breaker

Protected with circuit breaker for:
- Network failures
- Contract errors
- Rate limiting

## Error Handling

Common errors and recovery:

| Error | Cause | Solution |
|-------|-------|----------|
| Missing RPC URL | Environment variable not set | Set U2U_RPC_URL in .env |
| Invalid contract address | Wrong contract deployment | Verify contract address on block explorer |
| Insufficient gas | Account balance too low | Fund U2U_ACCOUNT_ADDRESS with testnet U2U |
| Tag already exists | Tag name taken | Choose different tag name |
| Contract revert | Contract validation failed | Check contract requirements |

## Performance Considerations

- **Gas Price:** U2U has lower gas costs compared to Ethereum mainnet
- **Block Time:** ~2 seconds per block
- **Finality:** ~13 blocks for secure confirmation
- **RPC Limits:** Follow U2U RPC rate limits

## Security Best Practices

1. **Private Keys:** Use environment variables, never hardcode
2. **RPC Endpoints:** Use HTTPS only, never HTTP
3. **Account Funding:** Use minimum required balance
4. **Rate Limiting:** Implement client-side rate limiting
5. **Contract Verification:** Verify contract address before deployment

## Troubleshooting

### Issue: "Missing environment variables for chain: u2u"

**Solution:** Ensure all U2U_* variables are set in .env:
```bash
U2U_RPC_URL=...
U2U_CONTRACT_ADDRESS=...
U2U_ACCOUNT_ADDRESS=...
U2U_PRIVATE_KEY=...
```

### Issue: "Cannot connect to RPC"

**Solution:** 
1. Check RPC URL is correct
2. Verify network connectivity
3. Try alternative RPC endpoint if available

### Issue: "Invalid contract address"

**Solution:**
1. Verify address format (should start with 0x)
2. Check address on U2U block explorer
3. Ensure contract is deployed on correct network

## Integration Checklist

- [ ] U2U environment variables configured
- [ ] Contract deployed on U2U testnet
- [ ] Account funded with testnet U2U
- [ ] RPC connection verified
- [ ] Tag registration tested
- [ ] Transaction tested and confirmed
- [ ] Balance polling worker running
- [ ] Transaction confirmation worker running
- [ ] Monitoring and alerting set up
- [ ] Production deployment plan documented

## References

- U2U Network: https://u2u.xyz
- Documentation: https://docs.u2u.xyz
- Testnet Faucet: https://testnet-faucet.u2u.xyz
- Block Explorer: https://testnet.u2uscan.xyz
- GitHub: https://github.com/U2U-Foundation

## Support

For U2U-specific integration questions:
1. Check U2U documentation
2. Review blockchain logs in system
3. Test with block explorer
4. Contact U2U support team
