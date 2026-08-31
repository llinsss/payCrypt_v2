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

    receive() external payable {}
}
