// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Wallet - A minimal smart wallet contract
contract Wallet {
    // Address of the wallet owner
    address public router;

    /// @notice Constructor sets the initial owner of the wallet
    /// @param _router The address of the router contract
    constructor(address _router) {
        router = _router;
    }

    /// @notice Modifier to restrict actions to the wallet owner only
    modifier onlyOwner() {
        require(msg.sender == router, "Not authorized");
        _;
    }

    /// @notice Allows the owner to withdraw funds to a specified address
    /// @param recipient The address to which the funds will be sent
    /// @param amount The amount of Ether to withdraw
    function withdrawETH(address payable recipient, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool sent,) = recipient.call{value: amount}("");
        require(sent, "Transfer failed");
    }

    /// @notice Returns the current Ether balance of the smart wallet
    /// @return The Ether balance held by the wallet
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /* -------------------------------------------------------------------------- */
    /*                            ERC20 Wallet Functions                          */
    /* -------------------------------------------------------------------------- */

    /**
     * @notice Withdraw an ERC20 token from the wallet to an address
     * @param token Address of the ERC20 token contract
     * @param recipient Address to receive the tokens
     * @param amount Amount of tokens (in token decimals) to withdraw
     */
    function withdrawERC20(address token, address recipient, uint256 amount) external onlyOwner returns (bool) {
        IERC20 erc20 = IERC20(token);
        require(erc20.balanceOf(address(this)) >= amount, "Insufficient token balance");

        bool sent = erc20.transfer(recipient, amount);
        require(sent, "Token transfer failed");

        return true;
    }

    /**
     * @notice Returns the ERC20 token balance held by this wallet
     * @param token Address of the ERC20 token
     * @return Token balance owned by this wallet
     */
    function getERC20Balance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Accepts direct Ether deposits
    receive() external payable {}
}

interface IWallet {
    function withdrawETH(address payable recipient, uint256 amount) external;
    function getBalance() external view returns (uint256);
    function getERC20Balance(address token) external view returns (uint256);
    function withdrawERC20(address token, address recipient, uint256 amount) external returns (bool);
}
/// @title TagRouter - A contract to manage tag-based ETH routing to user-owned wallets.

contract TagRouter is ReentrancyGuard {
    address public owner;

    struct UserProfile {
        address owner; // The address that owns the tag
        address user_chainAddress; // The auto-generated wallet address for the user
        bool exists; // Whether the tag has been registered
    }

    mapping(string => UserProfile) private userProfiles; // Maps tags to user profiles
    mapping(string => bool) private tagTaken; // Tracks whether a tag is already taken

    event TagRegistered(string indexed tag, address indexed owner);
    event DepositReceived(string indexed tag, address indexed from, uint256 amount);
    event SwappedFromWallet(
        address indexed wallet, address indexed token, uint256 ethAmount, uint256 tokenAmount, string tag
    );
    event SwappedFromToken(
        address indexed wallet, address indexed token, uint256 tokenAmount, uint256 ethAmount, string tag
    );

    /// @notice Constructor sets the initial owner of the wallet
    constructor() {
        owner = msg.sender;
    }

    // Ensures that only the owner of a tag can call certain functions
    modifier onlyTagOwner(string memory tag) {
        require(userProfiles[tag].owner == msg.sender, "Not tag owner");
        _;
    }

    /// @notice Registers a unique tag and deploys a user wallet
    /// @param tag The unique string identifier for the user
    /// @param _owner The address of the user who owns the tag
    /// @return The deployed wallet address associated with the tag
    function registerTag(string memory tag, address _owner) external returns (address) {
        require(!tagTaken[tag], "Tag already taken");
        require(bytes(tag).length > 2, "Tag too short");

        address userwallet = address(new Wallet(address(this)));
        userProfiles[tag] = UserProfile(_owner, userwallet, true);
        tagTaken[tag] = true;

        emit TagRegistered(tag, _owner);
        return userwallet;
    }

    /// @notice Allows sending ETH to a tag, which gets forwarded to the tag owner's wallet
    /// @param tag The registered tag to deposit ETH to
    function depositToTag(string memory tag) external payable {
        require(userProfiles[tag].exists, "Tag not registered");
        require(msg.value > 0, "No ETH sent");

        address userWallet = userProfiles[tag].user_chainAddress;
        require(userWallet != address(0), "User wallet not found");

        (bool success,) = userWallet.call{value: msg.value}("");
        require(success, "ETH transfer to user wallet failed");

        emit DepositReceived(tag, msg.sender, msg.value);
    }

    /// @notice Allows sending ETH to a tag, which gets forwarded to the tag owner's wallet
    /// @param tag The registered tag to deposit ETH to
    function depositERC20ToTag(string memory tag, address token, uint256 amount) external {
        require(userProfiles[tag].exists, "Tag not registered");
        require(amount > 0, "No tokens sent");
        require(token != address(0), "Invalid token address");

        address userWallet = userProfiles[tag].user_chainAddress;
        require(userWallet != address(0), "User wallet not found");

        IERC20 erc20 = IERC20(token);
        require(erc20.allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");

        bool success = erc20.transferFrom(msg.sender, userWallet, amount);
        require(success, "Token transfer failed");

        emit DepositReceived(tag, msg.sender, amount);
    }

    /// @notice Returns the wallet address associated with a tag
    /// @param tag The registered tag
    /// @return The wallet address deployed for the tag
    function getUserChainAddress(string memory tag) external view returns (address) {
        require(userProfiles[tag].exists, "Tag does not exist");
        return userProfiles[tag].user_chainAddress;
    }

    /// @notice Returns the current ETH balance of the tag’s wallet
    /// @param tag The registered tag
    /// @return The ETH balance of the tag's wallet
    function getTagBalance(string memory tag) external view returns (uint256) {
        address userwallet = userProfiles[tag].user_chainAddress;
        require(userwallet != address(0), "Tag not registered");
        return userwallet.balance;
    }

    /// @notice Withdraws the entire contract ETH balance to the given address.
    /// @dev Only the contract owner can call this function.
    /// @param to The address that will receive the withdrawn ETH.
    function withdrawFromContract(address to) external {
        require(msg.sender == owner, "Only owner can withdraw");
        require(to != address(0), "Invalid recipient address");

        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        (bool success,) = to.call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Returns the ETH balance held by the contract.
     * @return balance The balance of the contract in wei.
     */
    function getContractBalance() external view returns (uint256 balance) {
        return address(this).balance;
    }

    /**
     * @notice Swap ETH sent in the transaction for an ERC20 token at a given rate.
     * @param token The ERC20 token contract address to send to the user.
     * @param rate  Number of tokens to send per 1 ETH (18 decimals).
     *              Example: If 1 ETH = 200 USDC, rate = 200 * 10^18.
     */
    function swapEthForToken(address token, uint256 rate, string memory _tag, uint256 _amountEth) public nonReentrant {
        require(_amountEth > 0, "No ETH amount");
        require(rate > 0, "Invalid rate");

        address walletAddr = userProfiles[_tag].user_chainAddress;
        require(walletAddr != address(0), "Tag not registered");

        IWallet wallet = IWallet(payable(walletAddr));
        require(wallet.getBalance() >= _amountEth, "Insufficient ETH in user wallet");

        uint256 before = address(this).balance;
        wallet.withdrawETH(payable(address(this)), _amountEth);
        require(address(this).balance >= before + _amountEth, "Withdraw failed");

        uint256 amountToSend = (_amountEth * rate) / 1 ether;

        IERC20 erc20 = IERC20(token);
        require(erc20.balanceOf(address(this)) >= amountToSend, "Insufficient token liquidity");

        IERC20(token).transfer(walletAddr, amountToSend);

        emit SwappedFromWallet(walletAddr, token, _amountEth, amountToSend, _tag);
    }

    /**
     * @notice Swap ERC20 tokens sent by the user for ETH at a given rate.
     * @param token The ERC20 token contract address being swapped in.
     * @param amount The amount of tokens the user wants to swap (token decimals).
     * @param rate  Number of tokens required per 1 ETH (18 decimals).
     * @param _tag The tag associated with the user.
     *              Example: If 200 USDC = 1 ETH, rate = 200 * 10^18.
     */
    /**
     * @notice Swap ERC20 tokens (from the user's wallet contract) for ETH at a given rate.
     * @param token The ERC20 token contract address being swapped in.
     * @param amount The amount of tokens the user wants to swap (in token decimals).
     * @param rate   Number of tokens required per 1 ETH (scaled to 18 decimals).
     *               Example: If 200 USDC = 1 ETH, rate = 200 * 10^18.
     * @param _tag   The tag associated with the user.
     */
    function swapTokenForEth(address token, uint256 amount, uint256 rate, string memory _tag) public nonReentrant {
        require(amount > 0, "No token amount");
        require(rate > 0, "Invalid rate");

        address walletAddr = userProfiles[_tag].user_chainAddress;
        require(walletAddr != address(0), "Tag not registered");

        // Calculate how much ETH to send
        // Formula: amount / rate = ETH (scaled by 1 ether for precision)
        uint256 ethToSend = (amount * 1 ether) / rate;
        require(address(this).balance >= ethToSend, "Insufficient ETH liquidity");

        IERC20 erc20 = IERC20(token);
        IWallet wallet = IWallet(payable(walletAddr));

        uint256 beforeBal = erc20.balanceOf(address(this));

        // Pull tokens from the user’s on-chain wallet into this contract
        wallet.withdrawERC20(address(erc20), address(this), amount);

        // Verify we actually received the tokens
        require(erc20.balanceOf(address(this)) >= beforeBal + amount, "Token transfer failed");

        // Send ETH to the user's wallet
        (bool sent,) = payable(walletAddr).call{value: ethToSend}("");
        require(sent, "ETH transfer failed");

        emit SwappedFromToken(walletAddr, token, amount, ethToSend, _tag);
    }

    /**
     * @notice Returns the ERC20 token balance held by this wallet
     * @param token Address of the ERC20 token
     * @return Token balance owned by this wallet
     */
    function getERC20Balance(address token, string memory _tag) external view returns (uint256) {
        address _address = userProfiles[_tag].user_chainAddress;
        require(_address != address(0), "Tag not registered");
        require(token != address(0), "Invalid token address");
        // Return the balance of the token for the user's wallet address
        return IERC20(token).balanceOf(_address);
    }

    function withdrawEthFromWallet(address to, uint256 amount, string memory _tag) external onlyTagOwner(_tag) {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than 0");

        IWallet wallet = IWallet(payable(userProfiles[_tag].user_chainAddress));
        uint256 balance = wallet.getBalance();
        require(balance >= amount, "Insufficient wallet balance");

        wallet.withdrawETH(payable(to), amount);
    }

    /// @notice Fallback receive function to allow ETH transfers directly to the router contract
    receive() external payable {}
}
