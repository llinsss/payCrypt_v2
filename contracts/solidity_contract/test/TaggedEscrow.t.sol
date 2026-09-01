// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {TaggedEscrow} from "../src/TaggedEscrow.sol";
import {USDC} from "../src/MockUsdc.sol";

contract TaggedEscrowTest is Test {
    TaggedEscrow public escrow;
    USDC public usdc;

    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address owner = makeAddr("owner");
    uint256 constant LOCK_PERIOD = 3 days;
    uint256 constant AMOUNT = 1000e6; // 1000 USDC (6 decimals)

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 lockPeriod,
        string senderTag,
        string recipientTag
    );

    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed recipient,
        uint256 amount
    );

    event EscrowCancelled(
        uint256 indexed escrowId,
        address indexed sender,
        uint256 refundAmount
    );

    function setUp() public {
        escrow = new TaggedEscrow();
        usdc = new USDC(owner);

        // Mint USDC to sender
        vm.prank(owner);
        usdc.mint(sender, 100000e6);

        // Approve escrow contract
        vm.prank(sender);
        usdc.approve(address(escrow), 100000e6);
    }

    /* ──────────────────────── ESCROW CREATION ──────────────────────── */

    function testCreateEscrow() public {
        vm.expectEmit(true, true, true, true);
        emit EscrowCreated(1, sender, recipient, address(usdc), AMOUNT, LOCK_PERIOD, "alice", "bob");

        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        assertEq(escrowId, 1);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
    }

    function testCreateMultipleEscrows() public {
        vm.prank(sender);
        uint256 escrowId1 = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.prank(sender);
        uint256 escrowId2 = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        assertEq(escrowId1, 1);
        assertEq(escrowId2, 2);
        assertEq(escrow.getEscrowCount(), 2);
    }

    function testGetEscrowDetails() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        TaggedEscrow.Escrow memory escrowData = escrow.getEscrow(escrowId);
        assertEq(escrowData.sender, sender);
        assertEq(escrowData.recipient, recipient);
        assertEq(escrowData.token, address(usdc));
        assertEq(escrowData.amount, AMOUNT);
        assertEq(escrowData.lockPeriod, LOCK_PERIOD);
        assertEq(uint(escrowData.status), uint(TaggedEscrow.EscrowStatus.PENDING));
    }

    /* ──────────────────────── RELEASE ON EXPIRY ──────────────────── */

    function testReleaseEscrowAfterExpiry() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.expectEmit(true, true, true, true);
        emit EscrowReleased(escrowId, recipient, AMOUNT);

        vm.prank(recipient);
        escrow.releaseEscrow(escrowId);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
        assertEq(uint(escrow.getEscrowStatus(escrowId)), uint(TaggedEscrow.EscrowStatus.RELEASED));
    }

    function testReleaseBeforeLockPeriodExpiryReverts() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.expectRevert("Lock period not expired");
        vm.prank(recipient);
        escrow.releaseEscrow(escrowId);
    }

    function testSenderCanReleaseAfterExpiry() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(sender);
        escrow.releaseEscrow(escrowId);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
    }

    /* ──────────────────────── CANCEL BEFORE EXPIRY ──────────────── */

    function testCancelEscrowBeforeExpiry() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.expectEmit(true, true, true, true);
        emit EscrowCancelled(escrowId, sender, AMOUNT);

        vm.prank(sender);
        escrow.cancelEscrow(escrowId);

        assertEq(usdc.balanceOf(sender), 100000e6);
        assertEq(uint(escrow.getEscrowStatus(escrowId)), uint(TaggedEscrow.EscrowStatus.CANCELLED));
    }

    function testOnlySenderCanCancel() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.prank(recipient);
        vm.expectRevert("Only sender can cancel");
        escrow.cancelEscrow(escrowId);
    }

    function testCancelAfterExpiryReverts() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(sender);
        vm.expectRevert("Cannot cancel after lock period");
        escrow.cancelEscrow(escrowId);
    }

    /* ──────────────────────── CLAIM EXPIRED ──────────────────────── */

    function testClaimExpiredEscrow() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        address anyone = makeAddr("anyone");

        vm.expectEmit(true, true, true, true);
        emit EscrowReleased(escrowId, recipient, AMOUNT);

        vm.prank(anyone);
        escrow.claimExpiredEscrow(escrowId);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
    }

    function testClaimBeforeExpiryReverts() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.prank(makeAddr("anyone"));
        vm.expectRevert("Lock period not expired");
        escrow.claimExpiredEscrow(escrowId);
    }

    /* ──────────────────────── STATE TRANSITIONS ──────────────────── */

    function testDoubleReleaseReverts() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(recipient);
        escrow.releaseEscrow(escrowId);

        vm.prank(recipient);
        vm.expectRevert("Escrow not pending");
        escrow.releaseEscrow(escrowId);
    }

    function testDoubleCancelReverts() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.prank(sender);
        escrow.cancelEscrow(escrowId);

        vm.prank(sender);
        vm.expectRevert("Escrow not pending");
        escrow.cancelEscrow(escrowId);
    }

    /* ──────────────────────── INPUT VALIDATION ──────────────────── */

    function testInvalidRecipientReverts() public {
        vm.prank(sender);
        vm.expectRevert("Invalid recipient");
        escrow.createEscrow(
            address(0),
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );
    }

    function testInvalidTokenReverts() public {
        vm.prank(sender);
        vm.expectRevert("Invalid token");
        escrow.createEscrow(
            recipient,
            address(0),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );
    }

    function testZeroAmountReverts() public {
        vm.prank(sender);
        vm.expectRevert("Amount must be positive");
        escrow.createEscrow(
            recipient,
            address(usdc),
            0,
            LOCK_PERIOD,
            "alice",
            "bob"
        );
    }

    function testZeroLockPeriodReverts() public {
        vm.prank(sender);
        vm.expectRevert("Lock period must be positive");
        escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            0,
            "alice",
            "bob"
        );
    }

    function testEmptySenderTagReverts() public {
        vm.prank(sender);
        vm.expectRevert("Sender tag required");
        escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "",
            "bob"
        );
    }

    function testEmptyRecipientTagReverts() public {
        vm.prank(sender);
        vm.expectRevert("Recipient tag required");
        escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            ""
        );
    }

    /* ──────────────────────── TIME QUERIES ──────────────────────── */

    function testGetRemainingLockTime() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        uint256 remainingTime = escrow.getRemainingLockTime(escrowId);
        assertEq(remainingTime, LOCK_PERIOD);

        vm.warp(block.timestamp + 1 days);
        remainingTime = escrow.getRemainingLockTime(escrowId);
        assertEq(remainingTime, LOCK_PERIOD - 1 days);
    }

    function testIsLockPeriodExpired() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        assertFalse(escrow.isLockPeriodExpired(escrowId));

        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        assertTrue(escrow.isLockPeriodExpired(escrowId));
    }

    /* ──────────────────────── USER TRACKING ──────────────────────── */

    function testGetUserEscrowCount() public {
        vm.prank(sender);
        escrow.createEscrow(recipient, address(usdc), AMOUNT, LOCK_PERIOD, "alice", "bob");

        vm.prank(sender);
        escrow.createEscrow(recipient, address(usdc), AMOUNT, LOCK_PERIOD, "alice", "bob");

        assertEq(escrow.getUserEscrowCount(sender), 2);
        assertEq(escrow.getUserEscrowCount(recipient), 2);
    }

    function testGetUserEscrowAt() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        assertEq(escrow.getUserEscrowAt(sender, 0), escrowId);
        assertEq(escrow.getUserEscrowAt(recipient, 0), escrowId);
    }

    function testGetUserEscrowAtOutOfBounds() public {
        vm.prank(sender);
        escrow.createEscrow(recipient, address(usdc), AMOUNT, LOCK_PERIOD, "alice", "bob");

        vm.expectRevert("Index out of bounds");
        escrow.getUserEscrowAt(sender, 1);
    }

    /* ──────────────────────── EDGE CASES ──────────────────────── */

    function testGetNonexistentEscrow() public {
        vm.expectRevert("Escrow not found");
        escrow.getEscrow(999);
    }

    function testReleaseNonexistentEscrow() public {
        vm.expectRevert("Escrow not found");
        escrow.releaseEscrow(999);
    }

    function testLargeEscrowAmount() public {
        vm.prank(owner);
        usdc.mint(sender, 1000000e6);

        vm.prank(sender);
        usdc.approve(address(escrow), 1000000e6);

        uint256 largeAmount = 999999e6;

        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            largeAmount,
            LOCK_PERIOD,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(recipient);
        escrow.releaseEscrow(escrowId);

        assertEq(usdc.balanceOf(recipient), largeAmount);
    }

    function testShortLockPeriod() public {
        vm.prank(sender);
        uint256 escrowId = escrow.createEscrow(
            recipient,
            address(usdc),
            AMOUNT,
            1 seconds,
            "alice",
            "bob"
        );

        vm.warp(block.timestamp + 1 seconds + 1);

        vm.prank(recipient);
        escrow.releaseEscrow(escrowId);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
    }
}
