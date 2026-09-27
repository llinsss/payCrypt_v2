## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

## Contracts Overview

### AssetDecay
The `AssetDecay` contract (`src/AssetDecay.sol`) enables time-based native asset deposits with decay durations specified in seconds.
- **Time Units**: Uses `block.timestamp` (in seconds) rather than block numbers to ensure consistent wall-clock decay durations across any EVM chain.
- **Bounds**:
  - `MIN_DECAY_DURATION`: 1 second.
  - `MAX_DECAY_DURATION`: 365 days.
- **Eligibility**: An asset is eligible while `(block.timestamp - depositTimestamp) < decayDurationSeconds`. Once expired or withdrawn, it is ineligible.
