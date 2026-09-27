use starknet::ContractAddress;

/// Canonicalizes a `felt252` tag for storage/comparison (#514).
///
/// `felt252` tags are packed short strings (up to 31 ASCII bytes, big-endian
/// byte-per-limb). This walks those bytes, lowercases 'A'-'Z', and requires
/// every byte to be in the allow-list [a-z0-9_-]; anything else — including
/// any multi-byte UTF-8/confusable-Unicode sequence, which can't be packed
/// as plain ASCII bytes in the first place — is rejected with a revert
/// before any storage write. The returned canonical (lowercased) felt252 is
/// what is actually used as the map key everywhere tags are stored or
/// looked up; the caller's original `tag` is still what gets stored on
/// `UserProfile.tag` and emitted in events, purely for off-chain display.
pub fn normalize_tag(tag: felt252) -> felt252 {
    assert(tag != 0, 'Tag cannot be empty');
    let mut value: u256 = tag.into();
    let mut canonical: u256 = 0;
    let mut multiplier: u256 = 1;
    loop {
        if value == 0 {
            break;
        }
        let byte = value % 256;
        value = value / 256;
        let mut normalized_byte = byte;
        if byte >= 65 && byte <= 90 {
            // 'A'-'Z' -> 'a'-'z'
            normalized_byte = byte + 32;
        }
        let is_lower = normalized_byte >= 97 && normalized_byte <= 122; // 'a'-'z'
        let is_digit = normalized_byte >= 48 && normalized_byte <= 57; // '0'-'9'
        let is_allowed_punct = normalized_byte == 95 || normalized_byte == 45; // '_' or '-'
        assert(is_lower || is_digit || is_allowed_punct, 'Invalid tag character');
        canonical = canonical + normalized_byte * multiplier;
        multiplier = multiplier * 256;
    };
    canonical.try_into().unwrap()
}


#[derive(Drop, Serde, PartialEq, starknet::Store)]
pub struct UserProfile {
    pub tag: felt252,
    pub owner: ContractAddress,
    pub user_wallet: ContractAddress,
    pub exists: bool,
}

#[starknet::interface]
pub trait IPayCrypt<TContractState> {
    /// Registers a new tag and deploys a wallet for the user.
    /// @param tag The unique identifier for the user.
    /// @return The address of the deployed wallet.
    fn register_tag(ref self: TContractState, tag: felt252) -> ContractAddress;

    /// Deposits tokens to a user's wallet associated with a tag.
    /// @param tag The unique identifier for the user.
    /// @param amount The amount of tokens to deposit (must be > 0).
    /// @param token The address of the token contract (must be allowlisted).
    fn deposit_to_tag(ref self: TContractState, tag: felt252, amount: u256, token: ContractAddress);

    /// Retrieves the wallet address associated with a tag.
    /// @param tag The unique identifier for the user.
    /// @return The wallet address associated with the tag.
    fn get_tag_wallet_address(self: @TContractState, tag: felt252) -> ContractAddress;

    /// Retrieves the token balance of a user's wallet associated with a tag.
    /// @param tag The unique identifier for the user.
    /// @param token The address of the token contract.
    /// @return The balance of the specified token in the user's wallet.
    fn get_tag_wallet_balance(self: @TContractState, tag: felt252, token: ContractAddress) -> u256;

    /// Retrieves the token balance of the contract.
    /// @param token The address of the token contract.
    /// @return The balance of the specified token in the contract.
    fn get_contract_token_balance(self: @TContractState, token: ContractAddress) -> u256;

    /// Withdraws tokens from a user's wallet associated with a tag.
    /// @param token The address of the token contract (must be allowlisted).
    /// @param tag The unique identifier for the user.
    /// @param recipient_address The address to receive the withdrawn tokens.
    /// @param amount The amount of tokens to withdraw (must be > 0).
    fn withdraw_from_wallet(
        ref self: TContractState,
        token: ContractAddress,
        tag: felt252,
        recipient_address: ContractAddress,
        amount: u256,
    );

    /// Withdraws tokens from the contract (admin only).
    /// @param token The address of the token contract (must be allowlisted).
    /// @param recipient_address The address to receive the withdrawn tokens.
    /// @param amount The amount of tokens to withdraw (must be > 0).
    /// @return True if the withdrawal is successful.
    fn withdraw(
        ref self: TContractState,
        token: ContractAddress,
        recipient_address: ContractAddress,
        amount: u256,
    ) -> bool;

    /// Retrieves the user profile associated with a tag.
    /// @param tag The unique identifier for the user.
    /// @return The user profile associated with the tag.
    fn get_user_profile(self: @TContractState, tag: felt252) -> UserProfile;

    /// Retrieves the admin address of the contract.
    /// @return The address of the contract admin.
    fn get_admin_address(self: @TContractState) -> ContractAddress;

    /// Sets the token address for a given key and updates allowlist (admin only).
    /// @param token_key The key identifying the token (e.g., 'STRK', 'USDC').
    /// @param token_address The address of the token contract.
    fn set_token_address(
        ref self: TContractState, token_key: felt252, token_address: ContractAddress,
    );

    /// Checks if a token address is configured and allowlisted.
    /// @param token The address of the token contract to check.
    /// @return True if the token is supported.
    fn is_token_supported(self: @TContractState, token: ContractAddress) -> bool;

    /// Retrieves the token address associated with a given key.
    /// @param token_key The key identifying the token (e.g., 'STRK', 'USDC').
    /// @return The address of the token contract.
    fn get_token_address(self: @TContractState, token_key: felt252) -> ContractAddress;
}

#[starknet::contract]
pub mod PayCrypt {
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use staknet::contracts::wallet::{IWalletDispatcher, IWalletDispatcherTrait};
    use starknet::class_hash::ClassHash;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{
        ContractAddress, SyscallResultTrait, contract_address_const, get_block_timestamp,
        get_caller_address, get_contract_address,
    };
    use super::UserProfile;

    #[storage]
    struct Storage {
        is_tag_registered: Map<felt252, bool>,
        admin_address: ContractAddress,
        wallet_class_hash: ClassHash,
        user_profiles: Map<felt252, UserProfile>,
        token_addresses: Map<felt252, ContractAddress>,
        is_token_supported: Map<ContractAddress, bool>,
        reentrancy_guard: bool,
        // #616: monotonically increasing id used to reconcile a deposit/withdrawal
        // event emitted here with the corresponding event emitted by the Wallet
        // contract for the same operation.
        operation_nonce: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TagRegistered: TagRegistered,
        DepositReceived: DepositReceived,
        WithdrawalCompleted: WithdrawalCompleted,
        TokenAddressUpdated: TokenAddressUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TagRegistered {
        pub tag: felt252,
        pub wallet_address: ContractAddress,
    }

    /// #616: `operation_id` is a stable, per-contract-unique id for reconciling
    /// this deposit off-chain; `wallet` is the destination wallet address (the
    /// tag's wallet, distinct from `sender` which is the depositor).
    #[derive(Drop, starknet::Event)]
    pub struct DepositReceived {
        #[key]
        pub operation_id: u256,
        pub tag: felt252,
        pub wallet: ContractAddress,
        pub sender: ContractAddress,
        pub amount: u256,
        pub token: ContractAddress,
    }

    /// #616: `operation_id` is a stable, per-contract-unique id for reconciling
    /// this withdrawal off-chain (it also gets forwarded to the Wallet
    /// contract's own `WithdrawalCompleted` event for user-initiated
    /// withdrawals, so the two can be correlated). `wallet` is the source
    /// wallet (zero for admin/contract-level withdrawals, which have no tag);
    /// `recipient` is who actually received the funds.
    #[derive(Drop, starknet::Event)]
    pub struct WithdrawalCompleted {
        #[key]
        pub operation_id: u256,
        pub tag: felt252,
        pub wallet: ContractAddress,
        pub sender: ContractAddress,
        pub recipient: ContractAddress,
        pub amount: u256,
        pub token: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TokenAddressUpdated {
        pub token_key: felt252,
        pub previous_token_address: ContractAddress,
        pub new_token_address: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, admin_address: ContractAddress, wallet_class_hash: ClassHash,
    ) {
        let zero_address: ContractAddress = contract_address_const::<0>();
        assert(admin_address != zero_address, 'Invalid admin address');
        self.admin_address.write(admin_address);
        self.wallet_class_hash.write(wallet_class_hash);
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// #616: hands out a fresh, monotonically increasing operation id used
        /// to correlate deposit/withdrawal events for off-chain reconciliation.
        fn next_operation_id(ref self: ContractState) -> u256 {
            let id = self.operation_nonce.read() + 1;
            self.operation_nonce.write(id);
            id
        }
    }

    #[abi(embed_v0)]
    impl PayCryptImpl of super::IPayCrypt<ContractState> {
        /// Registers a new tag and deploys a wallet for the user.
        /// @param tag The unique identifier for the user.
        /// @return The address of the deployed wallet.
        fn register_tag(ref self: ContractState, tag: felt252) -> ContractAddress {
            let zero_address: ContractAddress = contract_address_const::<0>();
            assert(!self.reentrancy_guard.read(), 'Reentrancy detected');
            self.reentrancy_guard.write(true);

            // #514: register under the canonical (lowercased, charset-checked)
            // form of the tag so case/confusable variants can't collide with
            // or duplicate an existing registration. `tag` itself (as passed
            // in) is still what is stored/emitted for display below.
            let canonical_tag = normalize_tag(tag);
            let is_tag_registered = self.is_tag_registered.read(canonical_tag);
            assert(!is_tag_registered, 'Tag already taken');
            self.is_tag_registered.write(canonical_tag, true);

            let owner_address = get_caller_address();
            assert(owner_address != zero_address, 'Invalid owner address');

            let wallet_class_hash = self.wallet_class_hash.read();
            let strk_token_address = self.token_addresses.read('STRK');
            let usdc_token_address = self.token_addresses.read('USDC');
            assert(strk_token_address != zero_address, 'STRK address not set');
            assert(usdc_token_address != zero_address, 'USDC address not set');

            let mut wallet_constructor_calldata = array![
                owner_address.into(),
                get_contract_address().into(),
                usdc_token_address.into(),
                strk_token_address.into(),
            ];
            let salt: felt252 = get_block_timestamp().into();
            let (wallet_address, _) = deploy_syscall(
                wallet_class_hash, salt, wallet_constructor_calldata.span(), true,
            )
                .unwrap_syscall();
            assert(wallet_address != zero_address, 'Wallet deployment failed');

            let user_profile = UserProfile {
                tag, owner: owner_address, user_wallet: wallet_address, exists: true,
            };
            self.user_profiles.write(canonical_tag, user_profile);
            self.emit(TagRegistered { tag, wallet_address });

            self.reentrancy_guard.write(false);
            wallet_address
        }

        /// Deposits tokens to a user's wallet associated with a tag.
        /// @param tag The unique identifier for the user.
        /// @param amount The amount of tokens to deposit (must be > 0).
        /// @param token The address of the token contract (must be allowlisted).
        fn deposit_to_tag(
            ref self: ContractState, tag: felt252, amount: u256, token: ContractAddress,
        ) {
            let zero_address: ContractAddress = contract_address_const::<0>();
            assert(!self.reentrancy_guard.read(), 'Reentrancy detected');
            self.reentrancy_guard.write(true);

            assert(amount > 0, 'Amount must be positive');
            assert(token != zero_address, 'Invalid token address');
            assert(self.is_token_supported.read(token), 'Token not supported');

            let user_profile = self.user_profiles.read(tag);
            let user_profile = self.user_profiles.read(normalize_tag(tag));
            assert(user_profile.exists, 'User profile does not exist');

            let sender_address = get_caller_address();
            assert(sender_address != zero_address, 'Invalid sender address');

            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let sender_balance = erc20_dispatcher.balance_of(sender_address);
            assert(sender_balance >= amount, 'Insufficient sender balance');

            let allowance = erc20_dispatcher.allowance(sender_address, get_contract_address());
            assert(allowance >= amount, 'Insufficient allowance');

            let success = erc20_dispatcher
                .transfer_from(sender_address, user_profile.user_wallet, amount);
            assert(success, 'Token transfer failed');

            let operation_id = self.next_operation_id();
            self
                .emit(
                    DepositReceived {
                        operation_id,
                        tag,
                        wallet: user_profile.user_wallet,
                        sender: sender_address,
                        amount,
                        token,
                    },
                );
            self.reentrancy_guard.write(false);
        }

        /// Withdraws tokens from a user's wallet associated with a tag.
        /// @param token The address of the token contract (must be allowlisted).
        /// @param tag The unique identifier for the user.
        /// @param recipient_address The address to receive the withdrawn tokens.
        /// @param amount The amount of tokens to withdraw.
        fn withdraw_from_wallet(
            ref self: ContractState,
            token: ContractAddress,
            tag: felt252,
            recipient_address: ContractAddress,
            amount: u256,
        ) {
            let zero_address: ContractAddress = contract_address_const::<0>();
            assert(!self.reentrancy_guard.read(), 'Reentrancy detected');
            self.reentrancy_guard.write(true);

            assert(amount > 0, 'Amount must be positive');
            assert(token != zero_address, 'Invalid token address');
            assert(self.is_token_supported.read(token), 'Token not supported');
            assert(recipient_address != zero_address, 'Invalid recipient address');

            let user_profile = self.user_profiles.read(normalize_tag(tag));
            assert(user_profile.exists, 'Tag not registered');
            let sender_address = get_caller_address();
            assert(sender_address == user_profile.owner, 'Unauthorized: Not profile owner');

            // Audit (#513): `reentrancy_guard` (set true above, cleared below
            // after the external call) makes this function itself
            // non-reentrant; `wallet_dispatcher.withdraw` is the external
            // call, and no state here is written after it besides clearing
            // this guard.
            let wallet_dispatcher = IWalletDispatcher {
                contract_address: user_profile.user_wallet,
            };
            let wallet_balance = IERC20Dispatcher { contract_address: token }
                .balance_of(user_profile.user_wallet);
            assert(wallet_balance >= amount, 'Insufficient wallet balance');

            let operation_id = self.next_operation_id();
            let success = wallet_dispatcher
                .withdraw(operation_id, token, recipient_address, amount);
            assert(success, 'Wallet withdrawal failed');

            self
                .emit(
                    WithdrawalCompleted {
                        operation_id,
                        tag,
                        wallet: user_profile.user_wallet,
                        sender: sender_address,
                        recipient: recipient_address,
                        amount,
                        token,
                    },
                );
            self.reentrancy_guard.write(false);
        }

        /// Withdraws tokens from the contract (admin only).
        /// @param token The address of the token contract (must be allowlisted).
        /// @param recipient_address The address to receive the withdrawn tokens.
        /// @param amount The amount of tokens to withdraw.
        /// @return True if the withdrawal is successful.
        fn withdraw(
            ref self: ContractState,
            token: ContractAddress,
            recipient_address: ContractAddress,
            amount: u256,
        ) -> bool {
            let zero_address: ContractAddress = contract_address_const::<0>();
            assert(!self.reentrancy_guard.read(), 'Reentrancy detected');
            self.reentrancy_guard.write(true);

            assert(amount > 0, 'Amount must be positive');
            assert(token != zero_address, 'Invalid token address');
            assert(self.is_token_supported.read(token), 'Token not supported');
            assert(recipient_address != zero_address, 'Invalid recipient address');

            let sender_address = get_caller_address();
            let admin_address: ContractAddress = self.admin_address.read();
            assert(sender_address == admin_address, 'Unauthorized: Not admin');

            // Audit (#513): guarded by `reentrancy_guard` above/below; the
            // balance check is re-read live and nothing is written after the
            // external `transfer` call except clearing the guard.
            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            let contract_balance = erc20_dispatcher.balance_of(get_contract_address());
            assert(contract_balance >= amount, 'Insufficient contract balance');

            let success = erc20_dispatcher.transfer(recipient_address, amount);
            assert(success, 'Token transfer failed');

            // Admin/contract-level withdrawal: not tied to a tag or wallet.
            let operation_id = self.next_operation_id();
            self
                .emit(
                    WithdrawalCompleted {
                        operation_id,
                        tag: 0,
                        wallet: zero_address,
                        sender: sender_address,
                        recipient: recipient_address,
                        amount,
                        token,
                    },
                );
            self.reentrancy_guard.write(false);
            true
        }

        /// Sets the token address for a given key and updates allowlist (admin only).
        /// @param token_key The key identifying the token (e.g., 'STRK', 'USDC').
        /// @param token_address The address of the token contract.
        fn set_token_address(
            ref self: ContractState, token_key: felt252, token_address: ContractAddress,
        ) {
            let zero_address: ContractAddress = contract_address_const::<0>();
            let sender_address = get_caller_address();
            let admin_address = self.admin_address.read();
            assert(sender_address == admin_address, 'Unauthorized: Not admin');
            assert(token_address != zero_address, 'Invalid token address');

            let previous_token_address = self.token_addresses.read(token_key);
            if previous_token_address != zero_address && previous_token_address != token_address {
                self.is_token_supported.write(previous_token_address, false);
            }

            self.token_addresses.write(token_key, token_address);
            self.is_token_supported.write(token_address, true);
            self.emit(TokenAddressUpdated { token_key, previous_token_address, new_token_address: token_address });
        }

        /// Checks if a token address is configured and allowlisted.
        /// @param token The address of the token contract to check.
        /// @return True if the token is supported.
        fn is_token_supported(self: @ContractState, token: ContractAddress) -> bool {
            self.is_token_supported.read(token)
        }

        /// Retrieves the token address associated with a given key.
        /// @param token_key The key identifying the token (e.g., 'STRK', 'USDC').
        /// @return The address of the token contract.
        fn get_token_address(self: @ContractState, token_key: felt252) -> ContractAddress {
            self.token_addresses.read(token_key)
        }

        /// Retrieves the wallet address associated with a tag.
        /// @param tag The unique identifier for the user.
        /// @return The wallet address associated with the tag.
        fn get_tag_wallet_address(self: @ContractState, tag: felt252) -> ContractAddress {
            let user_profile = self.user_profiles.read(normalize_tag(tag));
            assert(user_profile.exists, 'User profile does not exist');
            user_profile.user_wallet
        }

        /// Retrieves the token balance of a user's wallet associated with a tag.
        /// @param tag The unique identifier for the user.
        /// @param token The address of the token contract.
        /// @return The balance of the specified token in the user's wallet.
        fn get_tag_wallet_balance(
            self: @ContractState, tag: felt252, token: ContractAddress,
        ) -> u256 {
            let zero_address: ContractAddress = contract_address_const::<0>();
            assert(token != zero_address, 'Invalid token address');
            assert(self.is_token_supported.read(token), 'Token not supported');
            let user_profile = self.user_profiles.read(tag);
            let user_profile = self.user_profiles.read(normalize_tag(tag));
            assert(user_profile.exists, 'User profile does not exist');

            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            erc20_dispatcher.balance_of(user_profile.user_wallet)
        }

        /// Retrieves the token balance of the contract.
        /// @param token The address of the token contract.
        /// @return The balance of the specified token in the contract.
        fn get_contract_token_balance(self: @ContractState, token: ContractAddress) -> u256 {
            let zero_address: ContractAddress = contract_address_const::<0>();
            assert(token != zero_address, 'Invalid token address');
            assert(self.is_token_supported.read(token), 'Token not supported');
            let erc20_dispatcher = IERC20Dispatcher { contract_address: token };
            erc20_dispatcher.balance_of(get_contract_address())
        }

        /// Retrieves the user profile associated with a tag.
        /// @param tag The unique identifier for the user.
        /// @return The user profile associated with the tag.
        fn get_user_profile(self: @ContractState, tag: felt252) -> UserProfile {
            let user_profile = self.user_profiles.read(normalize_tag(tag));
            assert(user_profile.exists, 'User profile does not exist');
            user_profile
        }

        /// Retrieves the admin address of the contract.
        /// @return The address of the contract admin.
        fn get_admin_address(self: @ContractState) -> ContractAddress {
            self.admin_address.read()
        }
    }
}

