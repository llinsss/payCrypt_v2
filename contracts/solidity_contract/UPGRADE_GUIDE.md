# TagRegistry Contract Upgrade Guide

## Overview

TagRegistry uses the UUPS (Universal Upgradeable Proxy Standard) pattern to allow for contract upgrades while preserving all deployed state and user data. This guide explains the upgrade process and best practices.

## Architecture

### Proxy Pattern
- **Pattern**: ERC1967Proxy + UUPSUpgradeable
- **Implementation**: TagRegistryV1 (and TagRegistryV2, etc.)
- **Governance**: Owner-controlled (`_authorizeUpgrade` restricted to `onlyOwner`)

### State Preservation
The proxy pattern ensures all state is preserved across upgrades:
- Tag ownership mappings
- Chain address associations
- Registered tags list
- All user data remains intact

## Upgrade Process

### For Contract Developers

#### 1. Create New Implementation

Create a new version contract (e.g., `TagRegistryV2.sol`):

```solidity
import {UUPSUpgradeable} from "lib/openzeppelin-contracts/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "lib/openzeppelin-contracts/contracts/access/OwnableUpgradeable.sol";
import {Initializable} from "lib/openzeppelin-contracts/contracts/proxy/utils/Initializable.sol";

contract TagRegistryV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // Keep all previous state variables in exact same order
    // Add new state variables at the end
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
```

**Important**: 
- Always keep existing state variable declarations in the same order
- Add new state variables at the end (gaps for storage layout compatibility)
- Do not remove or reorder existing state variables
- Use `Initializable` and initialize() for one-time setup

#### 2. Test the Upgrade

Use the upgrade test pattern:

```solidity
function testUpgrade() public {
    TagRegistryV2 v2 = new TagRegistryV2();
    vm.prank(owner);
    TagRegistryV1(address(proxy)).upgradeTo(address(v2));
    
    // Verify state preservation
    assertEq(TagRegistryV2(address(proxy)).getRegisteredTagsCount(), 
             TagRegistryV1(address(proxy)).getRegisteredTagsCount());
}
```

#### 3. Gas Considerations

- Upgrades are gas-efficient (one-time operation)
- Initial deployment: ~100-150k gas for proxy + implementation
- Upgrade transaction: ~50-75k gas

### For Network Operators

#### Prerequisites
- Owner/multisig wallet with upgrade authority
- New implementation contract deployed

#### Upgrade Steps

1. **Deploy new implementation**:
   ```bash
   forge create src/TagRegistryV2.sol:TagRegistryV2 --private-key $PRIVATE_KEY
   ```

2. **Call upgrade on proxy**:
   ```solidity
   ITransparentUpgradeableProxy(proxyAddress).upgradeTo(newImplementationAddress);
   ```

3. **Verify upgrade**:
   ```bash
   forge verify-contract proxyAddress TagRegistryV1 --chain mainnet
   ```

## Safety Guarantees

### State Preservation
- All storage slots are preserved during upgrade
- User mappings remain consistent
- Balance/ownership records never lost

### Access Control
- Only owner can call `upgradeTo()`
- No delegation of upgrade authority
- Transaction must be signed by authorized account

### Emergency Procedures
If an upgrade fails or introduces issues:

1. **Identify problem**: Check proxy implementation slot
   ```bash
   cast storage 0xProxyAddress 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
   ```

2. **Rollback**: Deploy previous version and upgrade to it
   ```solidity
   proxy.upgradeTo(previousImplementationAddress);
   ```

## Upgrade Checklist

Before deploying an upgrade:

- [ ] All state variables in same order as previous version
- [ ] New state variables added at end
- [ ] `_authorizeUpgrade` override present and restricted to owner
- [ ] New functions tested in isolation
- [ ] Upgrade tests pass (state preservation verified)
- [ ] No breaking changes to public function signatures
- [ ] Storage layout verified for compatibility
- [ ] Gas estimates within acceptable range
- [ ] Owner/multisig has upgrade authorization

## Version History

### V1 (Initial)
- Basic tag registration and resolution
- Tag ownership and transfer
- Chain address management

### V2 (Planned)
- Tag creation timestamp tracking
- Enhanced metadata support
- Reserved storage slots for future expansion

## Important Notes

- **Do not use constructor**: Always use `initialize()` decorated with `@initializer`
- **Do not modify storage layout**: Old state variables must remain in order
- **Gap pattern**: Reserve storage gaps for future versions if needed:
  ```solidity
  uint256[50] private __gap;
  ```
- **Test migrations**: Always have comprehensive tests for state preservation

## Support

For questions about contract upgrades:
1. Review TagRegistryUpgrade.t.sol test cases
2. Check OpenZeppelin upgrade documentation: https://docs.openzeppelin.com/contracts/4.x/upgradeable
3. Consult security audit before mainnet deployment

## Related Files

- Implementation: `src/TagRegistryV1.sol`, `src/TagRegistryV2.sol`
- Tests: `test/TagRegistry.t.sol`, `test/TagRegistryUpgrade.t.sol`
- Configuration: `foundry.toml`
