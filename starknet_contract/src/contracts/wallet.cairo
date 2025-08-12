// SPDX-License-Identifier: MIT
use starknet::ContractAddress;

#[starknet::interface]
pub trait IWallet<ContractState> {
    /// Withdraws tokens from the wallet to the owner's address.
    ///
    /// @param token The address of the ERC-20 token contract.
    /// @param amount The amount of tokens to withdraw.
    fn withdraw(ref self: ContractState, token: ContractAddress, amount: u256);

    /// Checks the balance of a specific token for a given address.
    ///
    /// @param token The address of the ERC-20 token contract.
    /// @param address The address to query the token balance for.
    /// @return The token balance of the given address.
    fn check_balance(
        self: @ContractState, token: ContractAddress, address: ContractAddress,
    ) -> u256;

    /// Returns the owner of this wallet.
    ///
    /// @return The ContractAddress of the wallet owner.
    fn get_owner(self: @ContractState) -> ContractAddress;

    /// Returns the balance of tokens owned by the wallet owner.
    ///
    /// @param token The address of the ERC-20 token contract.
    /// @return The token balance of the wallet owner.
    fn get_wallet_balance(self: @ContractState, token: ContractAddress) -> u256;
}

#[starknet::contract]
pub mod Wallet {
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use super::IWallet;

    #[storage]
    struct Storage {
        /// The owner of the wallet.
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        WithdrawalSuccessful: WithdrawalSuccessful,
    }

    #[derive(Drop, starknet::Event)]
    struct WithdrawalSuccessful {
        amount: u256,
        owner: ContractAddress,
    }

    /// Constructor to initialize the wallet with the owner's address.
    ///
    /// @param owner The address of the wallet owner.
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl WalletImpl of IWallet<ContractState> {
        /// Withdraws tokens from the wallet to the owner's address.
        ///
        /// @param token The address of the ERC-20 token contract.
        /// @param amount The amount of tokens to withdraw.
        fn withdraw(ref self: ContractState, token: ContractAddress, amount: u256) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Only owner can withdraw');
            let caller_balance = self.check_balance(token, caller);
            assert(caller_balance >= amount, 'Insufficient balance');
            assert(amount > 0, 'amount must be positive');
            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let success = erc20_dispatcher.transfer(caller, amount);
            assert(success, 'Transfer failed');
            // Emit an event for successful withdrawal
            self.emit(WithdrawalSuccessful { amount: amount, owner: caller });
        }

        /// Returns the token balance of a specific address.
        ///
        /// @param token The address of the ERC-20 token contract.
        /// @param address The address to query.
        /// @return The token balance of the address.
        fn check_balance(
            self: @ContractState, token: ContractAddress, address: ContractAddress,
        ) -> u256 {
            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            erc20_dispatcher.balance_of(address)
        }

        /// Returns the owner of the wallet.
        ///
        /// @return The address of the wallet owner.
        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        /// Returns the token balance of the wallet's owner.
        ///
        /// @param token The address of the ERC-20 token contract.
        /// @return The token balance of the wallet's owner.
        fn get_wallet_balance(self: @ContractState, token: ContractAddress) -> u256 {
            let owner = self.get_owner();
            self.check_balance(token, owner)
        }
    }
}
