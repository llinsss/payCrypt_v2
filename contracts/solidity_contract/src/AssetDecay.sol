// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

contract AssetDecay is ReentrancyGuard {
    address public owner;

    struct Asset {
        uint256 amount;
        uint256 depositBlock;
        uint256 decayPeriod;
        bool exists;
    }

    mapping(address => Asset) public assets;

    event AssetDeposited(address indexed user, uint256 amount, uint256 decayPeriod);
    event AssetWithdrawn(address indexed user, uint256 amount);
    event EligibilityChanged(address indexed user, bool eligible);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function deposit(uint256 _decayPeriod) external payable {
        require(msg.value > 0, "Amount must be > 0");
        require(_decayPeriod > 0, "Decay period must be > 0");
        // #611: overwriting a live entry here would orphan its ETH inside
        // the contract with no accounting pointing back to it. Require the
        // prior deposit to be fully withdrawn before a new one is opened.
        require(
            !assets[msg.sender].exists || assets[msg.sender].amount == 0,
            "Active deposit exists"
        );

        assets[msg.sender] = Asset({
            amount: msg.value,
            depositBlock: block.number,
            decayPeriod: _decayPeriod,
            exists: true
        });

        emit AssetDeposited(msg.sender, msg.value, _decayPeriod);
    }

    function isEligible(address user) public view returns (bool) {
        Asset storage asset = assets[user];
        if (!asset.exists || asset.amount == 0) return false;
        return (block.number - asset.depositBlock) < asset.decayPeriod;
    }

    /// @dev Audit (#513): follows checks-effects-interactions — `assets[msg.sender]`
    /// is deleted (effect) before the ETH is sent (interaction) — so a
    /// reentrant call from `msg.sender`'s fallback would already see
    /// `asset.exists == false` and revert. `nonReentrant` is added as
    /// defense-in-depth in case future changes weaken that ordering.
    function withdraw() external nonReentrant {
        Asset storage asset = assets[msg.sender];
        require(asset.exists, "No active asset");
        require(asset.amount > 0, "No balance");

        uint256 amount = asset.amount;
        delete assets[msg.sender];

        (bool sent,) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");

        emit AssetWithdrawn(msg.sender, amount);
    }

    function renounceOwnership() external onlyOwner {
        owner = address(0);
    }

    /// @dev #612: every wei this contract holds must be attributable to a
    /// `assets[user]` entry created by `deposit`, or `withdraw`'s accounting
    /// (`asset.amount` vs. actual balance) silently drifts. Direct transfers
    /// (plain sends, or any call with empty calldata) don't credit a user,
    /// so they are rejected here rather than left as unrecoverable dust.
    /// Note: `selfdestruct` can still force ETH into this contract without
    /// invoking `receive`; that ETH is intentionally never tracked or
    /// withdrawable — it is an accepted, unavoidable edge case of the EVM.
    receive() external payable {
        revert("Direct transfers not allowed");
    }
}
