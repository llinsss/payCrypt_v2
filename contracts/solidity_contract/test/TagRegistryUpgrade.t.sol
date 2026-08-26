// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {ERC1967Proxy} from "lib/openzeppelin-contracts/contracts/proxy/ERC1967Proxy.sol";
import {TagRegistryV1} from "../src/TagRegistryV1.sol";
import {TagRegistryV2} from "../src/TagRegistryV2.sol";

contract TagRegistryUpgradeTest is Test {
    TagRegistryV1 public v1;
    TagRegistryV2 public v2;
    ERC1967Proxy public proxy;

    address owner = makeAddr("owner");
    address user1 = makeAddr("user1");
    address chainAddr1 = makeAddr("chainAddr1");
    address chainAddr2 = makeAddr("chainAddr2");

    function setUp() public {
        vm.prank(owner);
        v1 = new TagRegistryV1();

        bytes memory initData = abi.encodeCall(TagRegistryV1.initialize, ());
        proxy = new ERC1967Proxy(address(v1), initData);

        vm.prank(owner);
        TagRegistryV1(address(proxy)).initialize();
    }

    function testUpgradeToV2() public {
        // Deploy V2
        v2 = new TagRegistryV2();

        // Upgrade via proxy
        vm.prank(owner);
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));

        // Verify we can call V1 functions
        vm.prank(user1);
        TagRegistryV1(address(proxy)).registerTag("alice", chainAddr1);

        assertEq(TagRegistryV1(address(proxy)).resolveTag("alice"), chainAddr1);
    }

    function testStatePreservationAfterUpgrade() public {
        // Register tags in V1
        vm.prank(user1);
        TagRegistryV1(address(proxy)).registerTag("alice", chainAddr1);

        vm.prank(user1);
        TagRegistryV1(address(proxy)).registerTag("bob", chainAddr2);

        uint256 tagCountBefore = TagRegistryV1(address(proxy)).getRegisteredTagsCount();
        assertEq(tagCountBefore, 2);

        // Deploy and upgrade to V2
        v2 = new TagRegistryV2();

        vm.prank(owner);
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));

        // Verify state is preserved
        assertEq(TagRegistryV2(address(proxy)).getRegisteredTagsCount(), 2);
        assertEq(TagRegistryV2(address(proxy)).resolveTag("alice"), chainAddr1);
        assertEq(TagRegistryV2(address(proxy)).resolveTag("bob"), chainAddr2);
    }

    function testV2NewFeaturesWork() public {
        // Setup: Register tag in V1
        vm.prank(user1);
        TagRegistryV1(address(proxy)).registerTag("alice", chainAddr1);

        // Upgrade to V2
        v2 = new TagRegistryV2();

        vm.prank(owner);
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));

        // Test V2 new feature: getTagCreatedAt
        uint256 createdAt = TagRegistryV2(address(proxy)).getTagCreatedAt("alice");
        assertGt(createdAt, 0);
        assertLe(createdAt, block.timestamp);
    }

    function testUpgradeRestrictionToNonOwner() public {
        v2 = new TagRegistryV2();

        vm.prank(user1);
        vm.expectRevert();
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));
    }

    function testMultipleTagsPreservedThroughUpgrade() public {
        // Register multiple tags
        for (uint i = 0; i < 5; i++) {
            string memory tag = string(abi.encodePacked("tag", uint256(i)));
            address chainAddr = makeAddr(string(abi.encodePacked("chain", uint256(i))));

            vm.prank(user1);
            TagRegistryV1(address(proxy)).registerTag(tag, chainAddr);
        }

        assertEq(TagRegistryV1(address(proxy)).getRegisteredTagsCount(), 5);

        // Upgrade to V2
        v2 = new TagRegistryV2();

        vm.prank(owner);
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));

        // Verify all tags preserved
        assertEq(TagRegistryV2(address(proxy)).getRegisteredTagsCount(), 5);

        for (uint i = 0; i < 5; i++) {
            string memory tag = string(abi.encodePacked("tag", uint256(i)));
            assertEq(TagRegistryV2(address(proxy)).getRegisteredTagAt(i), tag);
        }
    }

    function testTagTransferPreservedAfterUpgrade() public {
        address user2 = makeAddr("user2");

        // Register and transfer tag in V1
        vm.prank(user1);
        TagRegistryV1(address(proxy)).registerTag("alice", chainAddr1);

        vm.prank(user1);
        TagRegistryV1(address(proxy)).transferTag("alice", user2);

        // Verify transfer
        TagRegistryV1.TagProfile memory profileV1 = TagRegistryV1(address(proxy)).getTagProfile("alice");
        assertEq(profileV1.owner, user2);

        // Upgrade to V2
        v2 = new TagRegistryV2();

        vm.prank(owner);
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));

        // Verify transfer preserved in V2
        TagRegistryV2.TagProfile memory profileV2 = TagRegistryV2(address(proxy)).getTagProfile("alice");
        assertEq(profileV2.owner, user2);
    }

    function testProxyOwnershipPreserved() public {
        v2 = new TagRegistryV2();

        vm.prank(owner);
        TagRegistryV1(address(proxy)).upgradeTo(address(v2));

        assertEq(TagRegistryV2(address(proxy)).owner(), owner);
    }
}
