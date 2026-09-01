// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {AssetDecay} from "../src/AssetDecay.sol";

contract AssetDecayTest is Test {
    AssetDecay public assetDecay;

    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");

    event AssetDeposited(address indexed user, uint256 amount, uint256 decayDurationSeconds);
    event AssetWithdrawn(address indexed user, uint256 amount);
    event EligibilityChanged(address indexed user, bool eligible);

    function setUp() public {
        assetDecay = new AssetDecay();
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        // Set a realistic initial block timestamp
        vm.warp(1_700_000_000);
    }

    function test_depositAsset() public {
        uint256 duration = 100;

        vm.expectEmit(true, true, true, false);
        emit AssetDeposited(user1, 1 ether, duration);

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(duration);

        (uint256 amount, uint256 depositTimestamp, uint256 storedDuration, bool exists) =
            assetDecay.assets(user1);

        assertEq(amount, 1 ether);
        assertEq(depositTimestamp, block.timestamp);
        assertEq(storedDuration, duration);
        assertTrue(exists);
    }

    function test_assetEligibleAfterDeposit() public {
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(100);

        bool eligible = assetDecay.isEligible(user1);
        assertTrue(eligible, "Asset should be eligible right after deposit");
        assertEq(assetDecay.getRemainingDecayTime(user1), 100);
    }

    function test_assetEligibleBeforeDecayPeriodEnds() public {
        uint256 duration = 100;

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(duration);

        vm.warp(block.timestamp + duration - 1);

        assertTrue(assetDecay.isEligible(user1), "Asset should still be eligible 1 second before decay ends");
        assertEq(assetDecay.getRemainingDecayTime(user1), 1);
    }

    function test_assetIneligibleAtExactDecayBoundary() public {
        uint256 duration = 100;

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(duration);

        vm.warp(block.timestamp + duration);

        assertFalse(assetDecay.isEligible(user1), "Asset should be ineligible at the exact decay boundary");
        assertEq(assetDecay.getRemainingDecayTime(user1), 0);
    }

    function test_assetIneligibleAfterSufficientDecay() public {
        uint256 duration = 100;

        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(duration);

        assertTrue(assetDecay.isEligible(user1), "Asset should be eligible initially");

        vm.warp(block.timestamp + duration + 1);

        bool eligible = assetDecay.isEligible(user1);
        assertFalse(eligible, "Asset should be ineligible after decay period has passed");
        assertEq(assetDecay.getRemainingDecayTime(user1), 0);
    }

    function test_noDepositIsIneligible() public {
        assertFalse(assetDecay.isEligible(user1), "User with no deposit should be ineligible");
        assertEq(assetDecay.getRemainingDecayTime(user1), 0);
    }

    function test_eligibilityAfterWithdraw() public {
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(100);

        assertTrue(assetDecay.isEligible(user1), "Asset should be eligible");

        vm.prank(user1);
        assetDecay.withdraw();

        assertFalse(assetDecay.isEligible(user1), "User should be ineligible after withdrawal");
        assertEq(assetDecay.getRemainingDecayTime(user1), 0);
    }

    function test_depositZeroAmountReverts() public {
        vm.expectRevert("Amount must be > 0");
        vm.prank(user1);
        assetDecay.deposit{value: 0}(100);
    }

    function test_depositZeroDecayPeriodReverts() public {
        vm.expectRevert("Decay duration below minimum");
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(0);
    }

    function test_depositExceedsMaxDecayPeriodReverts() public {
        vm.expectRevert("Decay duration exceeds maximum");
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(365 days + 1);
    }

    function test_depositAtBoundaryValues() public {
        uint256 minDuration = assetDecay.MIN_DECAY_DURATION();
        uint256 maxDuration = assetDecay.MAX_DECAY_DURATION();

        // Minimum boundary: 1 second
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(minDuration);
        assertTrue(assetDecay.isEligible(user1));

        // Maximum boundary: 365 days
        vm.prank(user2);
        assetDecay.deposit{value: 1 ether}(maxDuration);
        assertTrue(assetDecay.isEligible(user2));
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
        uint256 t0 = block.timestamp;
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(50);

        vm.warp(t0 + 20);
        vm.prank(user2);
        assetDecay.deposit{value: 2 ether}(100);

        assertTrue(assetDecay.isEligible(user1));
        assertTrue(assetDecay.isEligible(user2));

        // At t0 + 50: user1 expires, user2 still has 70s left
        vm.warp(t0 + 50);
        assertFalse(assetDecay.isEligible(user1), "User1 should be expired");
        assertTrue(assetDecay.isEligible(user2), "User2 should still be eligible");

        // At t0 + 120: user2 expires
        vm.warp(t0 + 120);
        assertFalse(assetDecay.isEligible(user1));
        assertFalse(assetDecay.isEligible(user2));
    }

    function test_chainAssumptionIndependence() public {
        // Fast chain simulation (e.g. Arbitrum with 1000 blocks in 250s, or fast block production)
        uint256 duration = 300; // 300 seconds (5 minutes)
        vm.prank(user1);
        assetDecay.deposit{value: 1 ether}(duration);

        // Advance 10,000 blocks without advancing time
        vm.roll(block.number + 10_000);
        assertTrue(
            assetDecay.isEligible(user1),
            "Eligibility must depend on wall-clock time, not block numbers"
        );

        // Advance only 1 block but 301 seconds of timestamp
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 301);
        assertFalse(
            assetDecay.isEligible(user1),
            "Asset must decay after duration in seconds elapses regardless of block count"
        );
    }
}
