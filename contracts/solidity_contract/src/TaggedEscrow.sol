// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TaggedEscrow {
    enum EscrowStatus { PENDING, RELEASED, CANCELLED }

    struct Escrow {
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 lockPeriod;
        uint256 createdAt;
        EscrowStatus status;
        string senderTag;
        string recipientTag;
    }

    uint256 private escrowCounter;
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public userEscrows;

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

    constructor() {
        escrowCounter = 1;
    }

    function createEscrow(
        address recipient,
        address token,
        uint256 amount,
        uint256 lockPeriod,
        string memory senderTag,
        string memory recipientTag
    ) external returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be positive");
        require(lockPeriod > 0, "Lock period must be positive");
        require(bytes(senderTag).length > 0, "Sender tag required");
        require(bytes(recipientTag).length > 0, "Recipient tag required");

        uint256 escrowId = escrowCounter++;

        IERC20 erc20 = IERC20(token);
        require(
            erc20.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );

        escrows[escrowId] = Escrow(
            msg.sender,
            recipient,
            token,
            amount,
            lockPeriod,
            block.timestamp,
            EscrowStatus.PENDING,
            senderTag,
            recipientTag
        );

        userEscrows[msg.sender].push(escrowId);
        userEscrows[recipient].push(escrowId);

        emit EscrowCreated(
            escrowId,
            msg.sender,
            recipient,
            token,
            amount,
            lockPeriod,
            senderTag,
            recipientTag
        );

        return escrowId;
    }

    function releaseEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.sender != address(0), "Escrow not found");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");
        require(
            msg.sender == escrow.sender || msg.sender == escrow.recipient,
            "Not authorized"
        );

        uint256 lockExpiry = escrow.createdAt + escrow.lockPeriod;
        require(block.timestamp >= lockExpiry, "Lock period not expired");

        escrow.status = EscrowStatus.RELEASED;

        IERC20(escrow.token).transfer(escrow.recipient, escrow.amount);

        emit EscrowReleased(escrowId, escrow.recipient, escrow.amount);
    }

    function cancelEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.sender != address(0), "Escrow not found");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");
        require(msg.sender == escrow.sender, "Only sender can cancel");

        uint256 lockExpiry = escrow.createdAt + escrow.lockPeriod;
        require(block.timestamp < lockExpiry, "Cannot cancel after lock period");

        escrow.status = EscrowStatus.CANCELLED;

        IERC20(escrow.token).transfer(escrow.sender, escrow.amount);

        emit EscrowCancelled(escrowId, escrow.sender, escrow.amount);
    }

    function claimExpiredEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.sender != address(0), "Escrow not found");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");

        uint256 lockExpiry = escrow.createdAt + escrow.lockPeriod;
        require(block.timestamp >= lockExpiry, "Lock period not expired");

        escrow.status = EscrowStatus.RELEASED;

        IERC20(escrow.token).transfer(escrow.recipient, escrow.amount);

        emit EscrowReleased(escrowId, escrow.recipient, escrow.amount);
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        require(escrows[escrowId].sender != address(0), "Escrow not found");
        return escrows[escrowId];
    }

    function getEscrowStatus(uint256 escrowId) external view returns (EscrowStatus) {
        require(escrows[escrowId].sender != address(0), "Escrow not found");
        return escrows[escrowId].status;
    }

    function getUserEscrowCount(address user) external view returns (uint256) {
        return userEscrows[user].length;
    }

    function getUserEscrowAt(address user, uint256 index) external view returns (uint256) {
        require(index < userEscrows[user].length, "Index out of bounds");
        return userEscrows[user][index];
    }

    function isLockPeriodExpired(uint256 escrowId) external view returns (bool) {
        require(escrows[escrowId].sender != address(0), "Escrow not found");
        Escrow storage escrow = escrows[escrowId];
        return block.timestamp >= (escrow.createdAt + escrow.lockPeriod);
    }

    function getRemainingLockTime(uint256 escrowId) external view returns (uint256) {
        require(escrows[escrowId].sender != address(0), "Escrow not found");
        Escrow storage escrow = escrows[escrowId];
        uint256 lockExpiry = escrow.createdAt + escrow.lockPeriod;

        if (block.timestamp >= lockExpiry) {
            return 0;
        }

        return lockExpiry - block.timestamp;
    }

    function getEscrowCount() external view returns (uint256) {
        return escrowCounter - 1;
    }
}
