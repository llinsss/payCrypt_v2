// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AssetDecay
 * @notice Manages time-based asset deposits and eligibility verification.
 * @dev Durations are measured in seconds (using block.timestamp) rather than block numbers.
 * Block numbers vary significantly across chains (e.g., Ethereum ~12s, Arbitrum ~250ms, Base ~2s),
 * leading to inconsistent wall-clock decay durations if measured in blocks.
 * Using block.timestamp provides uniform and chain-agnostic decay behavior.
 */
contract AssetDecay {
    address public owner;

    /// @notice Minimum allowed decay duration (1 second).
    uint256 public constant MIN_DECAY_DURATION = 1;

    /// @notice Maximum allowed decay duration (365 days).
    uint256 public constant MAX_DECAY_DURATION = 365 days;

    struct Asset {
        uint256 amount;
        uint256 depositTimestamp;
        uint256 decayDurationSeconds;
        bool exists;
    }

    mapping(address => Asset) public assets;

    event AssetDeposited(address indexed user, uint256 amount, uint256 decayDurationSeconds);
    event AssetWithdrawn(address indexed user, uint256 amount);
    event EligibilityChanged(address indexed user, bool eligible);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Deposits native assets with a specified decay duration in seconds.
     * @param decayDurationSeconds The duration in seconds during which the asset remains eligible.
     * Must be between MIN_DECAY_DURATION and MAX_DECAY_DURATION.
     */
    function deposit(uint256 decayDurationSeconds) external payable {
        require(msg.value > 0, "Amount must be > 0");
        require(decayDurationSeconds >= MIN_DECAY_DURATION, "Decay duration below minimum");
        require(decayDurationSeconds <= MAX_DECAY_DURATION, "Decay duration exceeds maximum");

        assets[msg.sender] = Asset({
            amount: msg.value,
            depositTimestamp: block.timestamp,
            decayDurationSeconds: decayDurationSeconds,
            exists: true
        });

        emit AssetDeposited(msg.sender, msg.value, decayDurationSeconds);
    }

    /**
     * @notice Checks whether an asset deposited by a user is currently eligible.
     * @param user The address of the depositor.
     * @return True if the elapsed timestamp since deposit is strictly less than the decay duration.
     */
    function isEligible(address user) public view returns (bool) {
        Asset storage asset = assets[user];
        if (!asset.exists || asset.amount == 0) return false;
        return (block.timestamp - asset.depositTimestamp) < asset.decayDurationSeconds;
    }

    /**
     * @notice Returns the remaining decay time in seconds for a given user's asset.
     * @param user The address of the depositor.
     * @return Remaining seconds until decay expiration, or 0 if expired / non-existent.
     */
    function getRemainingDecayTime(address user) public view returns (uint256) {
        Asset storage asset = assets[user];
        if (!asset.exists || asset.amount == 0) return 0;
        uint256 elapsed = block.timestamp - asset.depositTimestamp;
        if (elapsed >= asset.decayDurationSeconds) return 0;
        return asset.decayDurationSeconds - elapsed;
    }

    /**
     * @notice Withdraws the caller's deposited asset balance.
     */
    function withdraw() external {
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
