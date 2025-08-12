// SPDX-License-Identifier: MIT
use starknet::ContractAddress;


#[derive(Drop, Serde, PartialEq, starknet::Store)]
pub struct UserProfile {
    pub tag: felt252,
    pub owner: ContractAddress,
    pub user_wallet: ContractAddress,
    pub exists: bool,
}

#[starknet::interface]
pub trait ITagRouter<TContractState> {
    /// Registers a new tag and deploys a wallet contract.
    /// @param tag The unique identifier for the user.
    /// @param owner The address that will own the deployed wallet.
    fn register_tag(
        ref self: TContractState, tag: felt252, owner: ContractAddress,
    ) -> ContractAddress;

    /// Deposits tokens into a user's wallet by tag.
    /// @param tag The tag associated with the user's wallet.
    /// @param amount The amount of tokens to deposit.
    /// @param token The ERC20 token contract address.
    fn deposit_to_tag(ref self: TContractState, tag: felt252, amount: u256, token: ContractAddress);

    /// Returns the wallet address associated with a given tag.
    /// @param tag The tag linked to the user wallet.
    fn get_user_chain_address(self: @TContractState, tag: felt252) -> ContractAddress;

    /// Returns the token balance for a tag's wallet.
    /// @param tag The tag linked to the wallet.
    /// @param token The token contract address to check balance for.
    fn get_tag_balance(self: @TContractState, tag: felt252, token: ContractAddress) -> u256;

    // get contract balance
    fn get_contract_balance(self: @TContractState, token: ContractAddress) -> u256;

    // withdraw from contract
    fn withdraw(
        ref self: TContractState, token: ContractAddress, address: ContractAddress, amount: u256,
    );

    fn get_user(self: @TContractState, tag: felt252) -> UserProfile;

    fn return_admin(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod TagRouter {
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::class_hash::ClassHash;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{
        ContractAddress, SyscallResultTrait, get_block_timestamp, get_caller_address,
        get_contract_address,
    };
    use super::UserProfile;

    #[storage]
    struct Storage {
        tag_taken: Map<felt252, bool>,
        admin: ContractAddress,
        wallet_classhash: ClassHash,
        wallets_by_tag: Map<felt252, ContractAddress>,
        tags_by_wallet: Map<ContractAddress, felt252>,
        wallet_owners: Map<ContractAddress, ContractAddress>,
        user_profiles: Map<felt252, UserProfile>,
    }


    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TagRegistered: TagRegistered,
        DepositReceived: DepositReceived,
        WithdrawSuccessful: WithdrawSuccessful,
    }

    #[derive(Drop, starknet::Event)]
    struct TagRegistered {
        tag: felt252,
        wallet: ContractAddress,
        owner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct DepositReceived {
        tag: felt252,
        from: ContractAddress,
        amount: u256,
        token: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct WithdrawSuccessful {
        from: ContractAddress,
        amount: u256,
        token: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress, wallet_classhash: ClassHash) {
        self.admin.write(admin);
        self.wallet_classhash.write(wallet_classhash);
    }

    #[abi(embed_v0)]
    impl TagRouterImpl of super::ITagRouter<ContractState> {
        fn register_tag(
            ref self: ContractState, tag: felt252, owner: ContractAddress,
        ) -> ContractAddress {
            let caller = get_caller_address();

            let tag_taken = self.tag_taken.read(tag);
            assert(!tag_taken, 'Tag already taken');
            self.tag_taken.write(tag, true);

            let wallet_classhash = self.wallet_classhash.read();

            let mut wallet_constructor_calldata = ArrayTrait::new();
            tag.serialize(ref wallet_constructor_calldata);
            caller.serialize(ref wallet_constructor_calldata);

            let salt: felt252 = get_block_timestamp().into();
            let (wallet_address, _) = deploy_syscall(
                wallet_classhash, salt, wallet_constructor_calldata.span(), true,
            )
                .unwrap_syscall();

            self.wallets_by_tag.write(tag, wallet_address);
            self.tags_by_wallet.write(wallet_address, tag);
            self.wallet_owners.write(wallet_address, owner);

            let user = UserProfile {
                tag, owner: caller, user_wallet: wallet_address, exists: true,
            };

            self.user_profiles.write(tag, user);
            self.emit(TagRegistered { tag, wallet: wallet_address, owner });

            wallet_address
        }

        fn deposit_to_tag(
            ref self: ContractState, tag: felt252, amount: u256, token: ContractAddress,
        ) {
            let caller = get_caller_address();
            assert(self.tag_taken.read(tag), 'Tag not registered');
            let user_profile = self.user_profiles.read(tag);
            assert(user_profile.exists, 'User profile does not exist');

            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let success = erc20_dispatcher.transfer(caller, amount);
            assert(success, 'Transfer failed');

            self.emit(DepositReceived { tag, from: caller, amount, token });
        }

        fn get_user_chain_address(self: @ContractState, tag: felt252) -> ContractAddress {
            let user_profile = self.user_profiles.read(tag);
            assert(user_profile.exists, 'User profile does not exist');
            let user_wallet = user_profile.user_wallet;
            user_wallet
        }

        fn get_tag_balance(self: @ContractState, tag: felt252, token: ContractAddress) -> u256 {
            let user_profile = self.user_profiles.read(tag);
            assert(user_profile.exists, 'User profile does not exist');
            let user_wallet = user_profile.user_wallet;
            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let balance = erc20_dispatcher.balance_of(user_wallet);
            balance
        }

        fn get_contract_balance(self: @ContractState, token: ContractAddress) -> u256 {
            let contract_address = get_contract_address();
            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let balance = erc20_dispatcher.balance_of(contract_address);
            balance
        }

        fn withdraw(
            ref self: ContractState, token: ContractAddress, address: ContractAddress, amount: u256,
        ) {
            let caller = get_caller_address();
            let admin = self.admin.read();
            assert(caller == admin, 'Tag not registered');

            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let success = erc20_dispatcher.transfer(address, amount);
            assert(success, 'Transfer failed');

            self.emit(WithdrawSuccessful { from: caller, amount, token });
        }

        fn get_user(self: @ContractState, tag: felt252) -> UserProfile {
            let user_profile = self.user_profiles.read(tag);
            assert(user_profile.exists, 'User profile does not exist');
            user_profile
        }

        fn return_admin(self: @ContractState) -> ContractAddress {
            let admin = self.admin.read();
            admin
        }
    }
}
