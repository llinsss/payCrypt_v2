// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {TagRegistry} from "../src/TagRegistry.sol";

contract TagRegistryTest is Test {
    TagRegistry public registry;

    address owner = makeAddr("owner");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");
    address chainAddr1 = makeAddr("chainAddr1");
    address chainAddr2 = makeAddr("chainAddr2");

    event TagRegistered(string indexed tag, address indexed owner, address indexed chainAddress);
    event TagTransferred(string indexed tag, address indexed from, address indexed to);
    event TagResolved(string indexed tag, address indexed chainAddress);

    function setUp() public {
        registry = new TagRegistry();
    }

    /* ──────────────────────── BASIC REGISTRATION ──────────────────────── */

    function testRegisterTag() public {
        vm.expectEmit(true, true, true, true);
        emit TagRegistered("alice", user1, chainAddr1);

        vm.prank(user1);
        bool success = registry.registerTag("alice", chainAddr1);

        assertTrue(success);
        assertTrue(registry.isTagTaken("alice"));
    }

    function testRegisterMultipleTags() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user2);
        registry.registerTag("bob", chainAddr2);

        assertTrue(registry.isTagTaken("alice"));
        assertTrue(registry.isTagTaken("bob"));
        assertEq(registry.getRegisteredTagsCount(), 2);
    }

    function testResolveTag() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        address resolved = registry.resolveTag("alice");
        assertEq(resolved, chainAddr1);
    }

    /* ──────────────────────── TRANSFER FUNCTIONALITY ──────────────────── */

    function testTransferTag() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.expectEmit(true, true, true, true);
        emit TagTransferred("alice", user1, user2);

        vm.prank(user1);
        bool success = registry.transferTag("alice", user2);

        assertTrue(success);

        TagRegistry.TagProfile memory profile = registry.getTagProfile("alice");
        assertEq(profile.owner, user2);
    }

    function testTransferTagPreservesChainAddress() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        registry.transferTag("alice", user2);

        TagRegistry.TagProfile memory profile = registry.getTagProfile("alice");
        assertEq(profile.chainAddress, chainAddr1);
    }

    function testUnauthorizedTransferReverts() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user2);
        vm.expectRevert("Not tag owner");
        registry.transferTag("alice", user2);
    }

    function testTransferToSameOwnerReverts() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        vm.expectRevert("Same owner");
        registry.transferTag("alice", user1);
    }

    function testTransferToZeroAddressReverts() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        vm.expectRevert("Invalid new owner");
        registry.transferTag("alice", address(0));
    }

    /* ──────────────────────── CHAIN ADDRESS UPDATES ──────────────────── */

    function testUpdateChainAddress() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        address newAddr = makeAddr("newChainAddr");

        vm.expectEmit(true, true, true, true);
        emit TagResolved("alice", newAddr);

        vm.prank(user1);
        bool success = registry.updateChainAddress("alice", newAddr);

        assertTrue(success);
        assertEq(registry.resolveTag("alice"), newAddr);
    }

    function testUpdateChainAddressUnauthorizedReverts() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user2);
        vm.expectRevert("Not tag owner");
        registry.updateChainAddress("alice", chainAddr2);
    }

    function testUpdateChainAddressToZeroReverts() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        vm.expectRevert("Invalid chain address");
        registry.updateChainAddress("alice", address(0));
    }

    /* ──────────────────────── TAG VALIDATION ──────────────────────────── */

    function testEmptyTagReverts() public {
        vm.prank(user1);
        vm.expectRevert("Tag cannot be empty");
        registry.registerTag("", chainAddr1);
    }

    function testDuplicateTagReverts() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user2);
        vm.expectRevert("Tag already taken");
        registry.registerTag("alice", chainAddr2);
    }

    function testTagWithInvalidChainAddressReverts() public {
        vm.prank(user1);
        vm.expectRevert("Invalid chain address");
        registry.registerTag("alice", address(0));
    }

    function testResolveUnregisteredTagReverts() public {
        vm.expectRevert("Tag not registered");
        registry.resolveTag("nonexistent");
    }

    function testGetProfileUnregisteredTagReverts() public {
        vm.expectRevert("Tag not registered");
        registry.getTagProfile("nonexistent");
    }

    /* ──────────────────────── FUZZ TESTS ──────────────────────────────── */

    function testFuzzRegisterVariousTagLengths(string memory tag) public {
        vm.assume(bytes(tag).length > 0);
        vm.assume(bytes(tag).length <= 32);

        vm.prank(user1);
        bool success = registry.registerTag(tag, chainAddr1);
        assertTrue(success);
        assertTrue(registry.isTagTaken(tag));
    }

    function testFuzzRegisterWithDifferentAddresses(address randomUser, address randomChain) public {
        vm.assume(randomUser != address(0));
        vm.assume(randomChain != address(0));

        vm.prank(randomUser);
        bool success = registry.registerTag("tag", randomChain);
        assertTrue(success);

        TagRegistry.TagProfile memory profile = registry.getTagProfile("tag");
        assertEq(profile.owner, randomUser);
        assertEq(profile.chainAddress, randomChain);
    }

    function testFuzzTransferToRandomAddresses(address recipient) public {
        vm.assume(recipient != address(0));
        vm.assume(recipient != user1);

        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        bool success = registry.transferTag("alice", recipient);
        assertTrue(success);

        TagRegistry.TagProfile memory profile = registry.getTagProfile("alice");
        assertEq(profile.owner, recipient);
    }

    function testFuzzUpdateChainAddresses(address newAddr1, address newAddr2) public {
        vm.assume(newAddr1 != address(0));
        vm.assume(newAddr2 != address(0));

        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        registry.updateChainAddress("alice", newAddr1);
        assertEq(registry.resolveTag("alice"), newAddr1);

        vm.prank(user1);
        registry.updateChainAddress("alice", newAddr2);
        assertEq(registry.resolveTag("alice"), newAddr2);
    }

    /* ──────────────────────── INVARIANT & BOUNDS ──────────────────────── */

    function testTagBoundary_MaxLength() public {
        string memory maxTag = "abcdefghijklmnopqrstuvwxyz123456"; // 32 chars
        vm.prank(user1);
        bool success = registry.registerTag(maxTag, chainAddr1);
        assertTrue(success);
    }

    function testTagBoundary_ExceedsMaxLength() public {
        string memory tooLongTag = "abcdefghijklmnopqrstuvwxyz1234567"; // 33 chars
        vm.prank(user1);
        vm.expectRevert("Tag too long");
        registry.registerTag(tooLongTag, chainAddr1);
    }

    function testRegisteredTagsCountIncrementsCorrectly() public {
        assertEq(registry.getRegisteredTagsCount(), 0);

        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);
        assertEq(registry.getRegisteredTagsCount(), 1);

        vm.prank(user2);
        registry.registerTag("bob", chainAddr2);
        assertEq(registry.getRegisteredTagsCount(), 2);
    }

    function testGetRegisteredTagAtIndexes() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user2);
        registry.registerTag("bob", chainAddr2);

        assertEq(registry.getRegisteredTagAt(0), "alice");
        assertEq(registry.getRegisteredTagAt(1), "bob");
    }

    function testGetRegisteredTagAtOutOfBoundsReverts() public {
        vm.expectRevert("Index out of bounds");
        registry.getRegisteredTagAt(0);
    }

    /* ──────────────────────── EDGE CASES ──────────────────────────────── */

    function testSingleCharacterTag() public {
        vm.prank(user1);
        bool success = registry.registerTag("a", chainAddr1);
        assertTrue(success);
    }

    function testNumericalTag() public {
        vm.prank(user1);
        bool success = registry.registerTag("12345", chainAddr1);
        assertTrue(success);
    }

    function testSpecialCharactersInTag() public {
        vm.prank(user1);
        bool success = registry.registerTag("user_tag-123", chainAddr1);
        assertTrue(success);
    }

    function testCaseSensitivity() public {
        vm.prank(user1);
        registry.registerTag("Alice", chainAddr1);

        vm.prank(user2);
        registry.registerTag("alice", chainAddr2);

        // Both should be registered as they are case-sensitive
        assertTrue(registry.isTagTaken("Alice"));
        assertTrue(registry.isTagTaken("alice"));
        assertEq(registry.getRegisteredTagsCount(), 2);
    }

    /* ──────────────────────── OWNER PERMISSIONS ──────────────────────── */

    function testOwnerAccess() public {
        assertEq(registry.owner(), address(this));
    }

    function testOwnerCanBeQueried() public {
        address registryOwner = registry.owner();
        assertEq(registryOwner, address(this));
    }

    /* ──────────────────────── GAS SNAPSHOTS ──────────────────────────── */

    function testGasSnapshot_RegisterTag() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);
    }

    function testGasSnapshot_ResolveTag() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        registry.resolveTag("alice");
    }

    function testGasSnapshot_TransferTag() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        vm.prank(user1);
        registry.transferTag("alice", user2);
    }

    function testGasSnapshot_UpdateChainAddress() public {
        vm.prank(user1);
        registry.registerTag("alice", chainAddr1);

        address newAddr = makeAddr("newChainAddr");
        vm.prank(user1);
        registry.updateChainAddress("alice", newAddr);
    }
}
