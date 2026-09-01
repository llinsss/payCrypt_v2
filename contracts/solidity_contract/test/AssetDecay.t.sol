// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {AssetDecay} from "../src/AssetDecay.sol";

contract AssetDecayTest is Test {
    AssetDecay public assetDecay;

    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");

    event AssetDeposited(address indexed user, uint256 amount, uint256 decayPeriod);
    event EligibilityChanged(address indexed user, bool eligible);

    function setUp() public {
        assetDecay = new AssetDecay();
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
    }

    function test_depositAsset() public {
        uint256 decayPeriod = 100;

        vm.expectEmit(true, true, true, false);
        emit AssetDeposited(user1, 1 ether, decayPeriod);

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(decayPeriod);

        (uint256 amount, uint256 depositBlock, uint256 storedDecayPeriod, bool exists) =
            assetDecay.assets(user1);

        assertEq(amount, 1 ether);
        assertEq(depositBlock, block.number);
        assertEq(storedDecayPeriod, decayPeriod);
        assertTrue(exists);
    }

    function test_assetEligibleAfterDeposit() public {
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(100);

        bool eligible = assetDecay.isEligible(user1);
        assertTrue(eligible, "Asset should be eligible right after deposit");
    }

    function test_assetIneligibleAfterSufficientDecay() public {
        uint256 decayPeriod = 100;

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(decayPeriod);

        assertTrue(assetDecay.isEligible(user1), "Asset should be eligible initially");

        vm.roll(block.number + decayPeriod + 1);

        bool eligible = assetDecay.isEligible(user1);
        assertFalse(eligible, "Asset should be ineligible after decay period has passed");
    }

    function test_assetEligibleBeforeDecayPeriodEnds() public {
        uint256 decayPeriod = 100;

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(decayPeriod);

        vm.roll(block.number + decayPeriod - 1);

        assertTrue(assetDecay.isEligible(user1), "Asset should still be eligible just before decay period ends");
    }

    function test_assetEligibleAtExactDecayBoundary() public {
        uint256 decayPeriod = 100;

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(decayPeriod);

        vm.roll(block.number + decayPeriod);

        assertFalse(assetDecay.isEligible(user1), "Asset should be ineligible at the decay boundary");
    }

    function test_noDepositIsIneligible() public {
        assertFalse(assetDecay.isEligible(user1), "User with no deposit should be ineligible");
    }

    function test_eligibilityAfterWithdraw() public {
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(100);

        assertTrue(assetDecay.isEligible(user1), "Asset should be eligible");

        vm.prank(user1);
        assetDecay.withdraw();

        assertFalse(assetDecay.isEligible(user1), "User should be ineligible after withdrawal");
    }

    function test_depositZeroAmountReverts() public {
        vm.expectRevert("Amount must be > 0");
        vm.prank(user1);
        assetDecay.deposit{value: 0}(100);
    }

    function test_depositZeroDecayPeriodReverts() public {
        vm.expectRevert("Decay period must be > 0");
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(0);
    }

    function test_withdrawWithoutDepositReverts() public {
        vm.expectRevert("No active asset");
        vm.prank(user2);
        assetDecay.withdraw();
    }

    function test_withdrawRestoresBalance() public {
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(100);

        uint256 beforeBalance = address(user1).balance;

        vm.prank(user1);
        assetDecay.withdraw();

        uint256 afterBalance = address(user1).balance;
        assertEq(afterBalance, beforeBalance + 1 ether, "User should get their ETH back");
    }

    function test_multiUserIndependence() public {
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(50);

        assertTrue(assetDecay.isEligible(user1));
        assertFalse(assetDecay.isEligible(user2), "User2 should be ineligible");

        vm.roll(block.number + 51);

        assertFalse(assetDecay.isEligible(user1), "User1 should be ineligible after decay");
        assertFalse(assetDecay.isEligible(user2), "User2 should remain ineligible");
    }

    function test_assetPreviouslyEligibleBecomesIneligibleAfterSufficientDecay() public {
        uint256 decayPeriod = 50;

        vm.prank(user1);
        assetDecay.deposit{value: 2 ether}(decayPeriod);

        assertTrue(assetDecay.isEligible(user1), "Asset should be eligible initially");

        vm.roll(block.number + 30);
        assertTrue(assetDecay.isEligible(user1), "Asset should still be eligible mid-decay");

        vm.roll(block.number + 50);
        assertFalse(assetDecay.isEligible(user1), "Asset should be ineligible after full decay period");
    }
}
