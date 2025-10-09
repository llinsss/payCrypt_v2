// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {TagRouter, Wallet} from "../src/Counter.sol";
import {USDC, USDT} from "../src/MockUsdc.sol";

contract TagRouterTest is Test {
    TagRouter public tagrouter;
    USDC public usdc;
    USDT public usdt;

    address owner = makeAddr("owner");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");

    event SwappedFromWallet(
        address indexed wallet, address indexed token, uint256 ethAmount, uint256 tokenAmount, string tag
    );

    function setUp() public {
        tagrouter = new TagRouter();
        usdc = new USDC(owner);
        usdt = new USDT(owner);

        vm.deal(address(tagrouter), 1000 ether); // Fund router liquidity
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
    }

    /* ---------------------------- TAG REGISTRATION ---------------------------- */

    function test_registerTag() public {
        string memory tag = "testTag";
        vm.expectEmit(true, true, false, false);
        emit TagRouter.TagRegistered(tag, user1);

        address userWallet = tagrouter.registerTag(tag, user1);
        address expectedWallet = tagrouter.getUserChainAddress(tag);

        assertEq(userWallet, expectedWallet);
    }

    function test_registerTagTwiceReverts() public {
        string memory tag = "dupTag";
        tagrouter.registerTag(tag, user1);

        vm.expectRevert("Tag already taken");
        tagrouter.registerTag(tag, user2);
    }

    function test_registerShortTagReverts() public {
        string memory tag = "a"; // too short
        vm.expectRevert("Tag too short");
        tagrouter.registerTag(tag, user1);
    }

    /* ---------------------------- ETH DEPOSITS ---------------------------- */

    function test_depositEthToTag() public {
        string memory tag = "ethTag";
        address userWallet = tagrouter.registerTag(tag, user1);

        vm.expectEmit(true, true, false, true);
        emit TagRouter.DepositReceived(tag, user1, 1 ether);

        vm.prank(user1);
        tagrouter.depositToTag{value: 1 ether}(tag);

        assertEq(userWallet.balance, 1 ether);
    }

    function test_depositZeroEthReverts() public {
        string memory tag = "zeroEth";
        tagrouter.registerTag(tag, user1);

        vm.expectRevert("No ETH sent");
        vm.prank(user1);
        tagrouter.depositToTag{value: 0}(tag);
    }

    /* ---------------------------- ERC20 DEPOSITS ---------------------------- */

    function test_depositERC20ToTag() public {
        string memory tag = "erc20Tag";
        address userWallet = tagrouter.registerTag(tag, user1);

        // Mint 1000 USDC to user1 (6 decimals)
        vm.startPrank(owner);
        usdc.mint(user1, 1000e6);
        vm.stopPrank();

        vm.startPrank(user1);
        usdc.approve(address(tagrouter), 1000e6);

        vm.expectEmit(true, true, false, true);
        emit TagRouter.DepositReceived(tag, user1, 1000e6);

        tagrouter.depositERC20ToTag(tag, address(usdc), 1000e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(userWallet), 1000e6);
    }

    function test_depositERC20InvalidAmountReverts() public {
        string memory tag = "erc20Invalid";
        tagrouter.registerTag(tag, user1);

        vm.expectRevert("No tokens sent");
        tagrouter.depositERC20ToTag(tag, address(usdc), 0);
    }

    /* ---------------------------- SWAPS ---------------------------- */

    function test_swapEthForToken() public {
        string memory tag = "testTag";

        // Register tag
        address userWallet = tagrouter.registerTag(tag, user1);

        // Fund user wallet with ETH
        vm.deal(userWallet, 1 ether);

        // Fund router with token liquidity
        vm.startPrank(owner);
        usdc.mint(address(tagrouter), 1_000_000e6); // 6 decimals for USDC
        vm.stopPrank();

        // Expect event
        vm.expectEmit(true, true, false, true);
        emit SwappedFromWallet(userWallet, address(usdc), 1 ether, 3500e6, tag);

        // Call swap
        vm.prank(address(tagrouter));
        tagrouter.swapEthForToken(address(usdc), 3500e6, tag, 1 ether);

        // Check balances
        uint256 userWalletUSDC = usdc.balanceOf(userWallet);
        assertEq(userWalletUSDC, 3500e6, "User wallet should receive correct USDC after swap");
    }

    function test_swapEthForTokenInsufficientLiquidityReverts() public {
        string memory tag = "swapEthFail";
        address userWallet = tagrouter.registerTag(tag, user1);
        vm.deal(userWallet, 1 ether);

        uint256 rate = 2000e18;

        vm.expectRevert("Insufficient token liquidity");
        vm.prank(address(tagrouter));
        tagrouter.swapEthForToken(address(usdc), rate, tag, 1 ether);
    }

    function test_swapTokenForEth() public {
        string memory tag = "swapToken";
        address userWallet = tagrouter.registerTag(tag, user1);

        // Fund router with ETH
        vm.deal(address(tagrouter), 100 ether);

        // Fund user wallet with tokens
        vm.startPrank(owner);
        usdc.mint(userWallet, 2000e6);
        vm.stopPrank();

        uint256 rate = 2000e18; // 2000 tokens = 1 ETH
        uint256 tokenAmount = 2000e6;
        uint256 expectedEth = (tokenAmount * 1 ether) / rate;

        vm.expectEmit(true, true, false, true);
        emit TagRouter.SwappedFromToken(userWallet, address(usdc), tokenAmount, expectedEth, tag);

        vm.prank(address(tagrouter));
        tagrouter.swapTokenForEth(address(usdc), tokenAmount, rate, tag);

        assertEq(userWallet.balance, expectedEth);
        assertEq(usdc.balanceOf(address(tagrouter)), tokenAmount);
    }

    function test_swapTokenForEthInsufficientLiquidityReverts() public {
        string memory tag = "testTag";
        address userWallet = tagrouter.registerTag(tag, user1);

        // Clear ETH from router to force revert
        vm.deal(address(tagrouter), 0); // <--- FIX: no ETH liquidity

        // Fund wallet with USDC
        vm.startPrank(owner);
        usdc.mint(userWallet, 10000);
        vm.stopPrank();

        // Expect revert
        vm.expectRevert("Insufficient ETH liquidity");
        vm.prank(user1);
        tagrouter.swapTokenForEth(address(usdc), 1000, 1000, tag);
    }

    /* ---------------------------- OWNER FUNCTIONS ---------------------------- */

    function test_onlyOwnerCanWithdrawFromContract() public {
        // Deploy with owner = address(this)
        TagRouter router = new TagRouter();

        // Fund the contract with some ETH
        vm.deal(address(router), 1 ether);

        // Switch to a non-owner account
        address attacker = address(0xBEEF);
        vm.startPrank(attacker);

        // Expect revert
        vm.expectRevert("Only owner can withdraw");
        router.withdrawFromContract(address(0xCAFE));

        vm.stopPrank();
    }

    function test_nonOwnerWithdrawFromContractReverts() public {
        vm.expectRevert("Only owner can withdraw");
        vm.prank(user1);
        tagrouter.withdrawFromContract(user1);
    }

    /* ---------------------------- WALLET PERMISSIONS ---------------------------- */

    function test_walletOnlyRouterCanWithdraw() public {
        address userWallet = tagrouter.registerTag("walletTag", user1);
        Wallet w = Wallet(payable(userWallet));

        vm.deal(userWallet, 1 ether);

        // User trying directly should fail
        vm.prank(user1);
        vm.expectRevert("Not authorized");
        w.withdrawETH(payable(user1), 0.5 ether);
    }

    function test_registerEmptyTagReverts() public {
        vm.expectRevert("Tag too short");
        tagrouter.registerTag("", user1);
    }

    function test_depositToUnregisteredTagReverts() public {
        vm.expectRevert("Tag not registered");
        vm.prank(user1);
        tagrouter.depositToTag{value: 1 ether}("ghostTag");
    }

    function test_depositERC20ToUnregisteredTagReverts() public {
        vm.expectRevert("Tag not registered");
        tagrouter.depositERC20ToTag("ghostTag", address(usdc), 100);
    }

    function test_swapEthForTokenTagNotRegisteredReverts() public {
        vm.expectRevert("Tag not registered");
        vm.prank(user1);
        tagrouter.swapEthForToken(address(usdc), 3500e6, "ghostTag", 1 ether);
    }

    function test_swapEthForTokenZeroEthReverts() public {
        string memory tag = "zeroSwapEth";
        tagrouter.registerTag(tag, user1);

        vm.expectRevert("No ETH amount");
        tagrouter.swapEthForToken(address(usdc), 3500e6, tag, 0);
    }

    function test_swapTokenForEthZeroAmountReverts() public {
        string memory tag = "zeroSwapToken";
        tagrouter.registerTag(tag, user1);

        vm.expectRevert("No token amount");
        tagrouter.swapTokenForEth(address(usdc), 0, 2000e18, tag);
    }

    function test_swapTokenForEthTagNotRegisteredReverts() public {
        vm.expectRevert("Tag not registered");
        tagrouter.swapTokenForEth(address(usdc), 1000, 2000e18, "ghostTag");
    }

    function test_withdrawFromContractZeroBalanceReverts() public {
        // Explicitly empty the router balance
        vm.deal(address(tagrouter), 0);

        // Must be called by owner
        vm.prank(tagrouter.owner());

        vm.expectRevert("No ETH to withdraw");
        tagrouter.withdrawFromContract(owner);
    }

    function test_withdrawFromContractInvalidRecipientReverts() public {
        vm.deal(address(tagrouter), 1 ether);

        vm.expectRevert("Invalid recipient address");
        tagrouter.withdrawFromContract(address(0));
    }

    function test_walletRejectsUnauthorizedERC20Withdrawal() public {
        address userWallet = tagrouter.registerTag("erc20Wallet", user1);
        Wallet w = Wallet(payable(userWallet));

        // Mint tokens into wallet
        vm.startPrank(owner);
        usdc.mint(userWallet, 1000e6);
        vm.stopPrank();

        // User1 tries direct withdrawal -> should revert
        vm.startPrank(user1);
        vm.expectRevert("Not authorized");
        w.withdrawERC20(address(usdc), user1, 500e6);
        vm.stopPrank();
    }

    function test_walletRejectsUnauthorizedETHWithdrawal() public {
        address userWallet = tagrouter.registerTag("ethWallet", user1);
        Wallet w = Wallet(payable(userWallet));

        vm.deal(userWallet, 2 ether);

        // user2 tries to withdraw -> revert
        vm.startPrank(user2);
        vm.expectRevert("Not authorized");
        w.withdrawETH(payable(user2), 1 ether);
        vm.stopPrank();
    }
}
