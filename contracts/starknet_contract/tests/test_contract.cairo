use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use staknet::contracts::main::{IPayCryptDispatcher, IPayCryptDispatcherTrait};
use starknet::{ContractAddress, contract_address_const};


pub fn deploy_mock_erc20(name: ByteArray) -> IERC20Dispatcher {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let contract = declare("MyToken").unwrap().contract_class();
    let mut calldata = array![];
    let token_name: ByteArray = name.clone();
    let token_symbol: ByteArray = name.clone();

    token_name.serialize(ref calldata);
    token_symbol.serialize(ref calldata);
    admin.serialize(ref calldata);

    let (contract_address, _) = contract.deploy(@calldata).unwrap();

    IERC20Dispatcher { contract_address }
}

fn deploy_contract() -> (IPayCryptDispatcher, ContractAddress, ContractAddress) {
    let erc20 = deploy_mock_erc20("STRK");
    let usdc = deploy_mock_erc20("USDC");

    let strkaddress = erc20.contract_address;
    let usdcaddress = usdc.contract_address;

    let admin: ContractAddress = contract_address_const::<'admin'>();
    let wallet_classhash = declare("Wallet").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    admin.serialize(ref calldata);
    wallet_classhash.serialize(ref calldata);
    let contract = declare("PayCrypt").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@calldata).unwrap();

    let dispatcher = IPayCryptDispatcher { contract_address };

    // Configure initial STRK and USDC tokens as admin
    start_cheat_caller_address(contract_address, admin);
    dispatcher.set_token_address('STRK', strkaddress);
    dispatcher.set_token_address('USDC', usdcaddress);
    stop_cheat_caller_address(contract_address);

    (dispatcher, strkaddress, usdcaddress)
}

#[test]
fn test_contract_deployment() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (dispatcher, strk, usdc) = deploy_contract();
    let a = dispatcher.get_admin_address();
    assert(admin == a, 'Invalid admin');
    assert(dispatcher.is_token_supported(strk), 'STRK should be supported');
    assert(dispatcher.is_token_supported(usdc), 'USDC should be supported');
}

#[test]
fn test_set_token_address_by_admin() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (dispatcher, _, _) = deploy_contract();
    let new_token = deploy_mock_erc20("DAI");

    start_cheat_caller_address(dispatcher.contract_address, admin);
    dispatcher.set_token_address('DAI', new_token.contract_address);
    stop_cheat_caller_address(dispatcher.contract_address);

    assert(dispatcher.is_token_supported(new_token.contract_address), 'DAI should be supported');
    assert(dispatcher.get_token_address('DAI') == new_token.contract_address, 'Wrong DAI address');
}

#[test]
#[should_panic(expected: 'Unauthorized: Not admin')]
fn test_set_token_address_unauthorized_reverts() {
    let non_admin: ContractAddress = contract_address_const::<'attacker'>();
    let (dispatcher, _, _) = deploy_contract();
    let new_token = deploy_mock_erc20("DAI");

    start_cheat_caller_address(dispatcher.contract_address, non_admin);
    dispatcher.set_token_address('DAI', new_token.contract_address);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: 'Invalid token address')]
fn test_set_token_address_zero_address_reverts() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (dispatcher, _, _) = deploy_contract();
    let zero_addr: ContractAddress = contract_address_const::<0>();

    start_cheat_caller_address(dispatcher.contract_address, admin);
    dispatcher.set_token_address('ZERO', zero_addr);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_set_token_address_updates_allowlist_when_overwritten() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (dispatcher, old_strk, _) = deploy_contract();
    let new_strk = deploy_mock_erc20("STRK_V2");

    assert(dispatcher.is_token_supported(old_strk), 'Old STRK should be active');

    start_cheat_caller_address(dispatcher.contract_address, admin);
    dispatcher.set_token_address('STRK', new_strk.contract_address);
    stop_cheat_caller_address(dispatcher.contract_address);

    assert(!dispatcher.is_token_supported(old_strk), 'Old STRK should be deactivated');
    assert(dispatcher.is_token_supported(new_strk.contract_address), 'New STRK should be active');
}

#[test]
fn test_register_tag() {
    let (dispatcher, _, _) = deploy_contract();

    let tag: felt252 = 'collins';
    let collins_wallet = dispatcher.register_tag(tag);

    let Collins = dispatcher.get_user_profile('collins');
    assert(Collins.user_wallet == collins_wallet, 'wrong wallet address');
    assert(Collins.exists, 'exists');
}

#[test]
fn test_deposit_to_tag() {
    let depositor: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, token_dispatcher, _) = deploy_contract();
    let token = IERC20Dispatcher { contract_address: token_dispatcher };

    // Approve router on token contract
    start_cheat_caller_address(token_dispatcher, depositor);
    token.approve(tag_router.contract_address, 50000);
    stop_cheat_caller_address(token_dispatcher);

    // Register the tag
    start_cheat_caller_address(tag_router.contract_address, depositor);
    let tag_wallet = tag_router.register_tag('tag_owner');

    let tag_balance_before = token.balance_of(tag_wallet);
    let depositor_balance_before = token.balance_of(depositor);

    // Deposit positive amount
    tag_router.deposit_to_tag('tag_owner', 10000, token_dispatcher);
    stop_cheat_caller_address(tag_router.contract_address);

    let tag_balance_after = token.balance_of(tag_wallet);
    let depositor_balance_after = token.balance_of(depositor);

    assert(tag_balance_before + 10000 == tag_balance_after, 'Incorrect tag wallet balance');
    assert(depositor_balance_before - 10000 == depositor_balance_after, 'Incorrect sender balance');
}

#[test]
#[should_panic(expected: 'Amount must be positive')]
fn test_deposit_zero_amount_reverts() {
    let depositor: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, token_dispatcher, _) = deploy_contract();
    let token = IERC20Dispatcher { contract_address: token_dispatcher };

    start_cheat_caller_address(token_dispatcher, depositor);
    token.approve(tag_router.contract_address, 50000);
    stop_cheat_caller_address(token_dispatcher);

    start_cheat_caller_address(tag_router.contract_address, depositor);
    tag_router.register_tag('tag_owner');

    // Deposit 0 amount should revert
    tag_router.deposit_to_tag('tag_owner', 0, token_dispatcher);
    stop_cheat_caller_address(tag_router.contract_address);
}

#[test]
#[should_panic(expected: 'Token not supported')]
fn test_deposit_unsupported_token_reverts() {
    let depositor: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, _, _) = deploy_contract();
    let rogue_token = deploy_mock_erc20("ROGUE");

    start_cheat_caller_address(rogue_token.contract_address, depositor);
    rogue_token.approve(tag_router.contract_address, 50000);
    stop_cheat_caller_address(rogue_token.contract_address);

    start_cheat_caller_address(tag_router.contract_address, depositor);
    tag_router.register_tag('tag_owner');

    // Deposit unconfigured/malicious token should revert
    tag_router.deposit_to_tag('tag_owner', 10000, rogue_token.contract_address);
    stop_cheat_caller_address(tag_router.contract_address);
}

#[test]
fn test_withdraw_from_tag() {
    let depositor: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, token_dispatcher, _) = deploy_contract();
    let token = IERC20Dispatcher { contract_address: token_dispatcher };

    // Approve and deposit
    start_cheat_caller_address(token_dispatcher, depositor);
    token.approve(tag_router.contract_address, 50000);
    stop_cheat_caller_address(token_dispatcher);

    start_cheat_caller_address(tag_router.contract_address, depositor);
    let tag_wallet = tag_router.register_tag('tag_owner');
    tag_router.deposit_to_tag('tag_owner', 10000, token_dispatcher);

    // Withdraw 3000 to recipient
    let recipient: ContractAddress = contract_address_const::<'recipient'>();
    tag_router.withdraw_from_wallet(token_dispatcher, 'tag_owner', recipient, 3000);
    stop_cheat_caller_address(tag_router.contract_address);

    let tag_balance_after_withdraw = token.balance_of(tag_wallet);
    let recipient_balance = token.balance_of(recipient);

    assert(tag_balance_after_withdraw == 7000, 'tag bal error');
    assert(recipient_balance == 3000, 'recipient bal error');
}

#[test]
#[should_panic(expected: 'Amount must be positive')]
fn test_withdraw_zero_amount_reverts() {
    let depositor: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, token_dispatcher, _) = deploy_contract();
    let token = IERC20Dispatcher { contract_address: token_dispatcher };

    start_cheat_caller_address(token_dispatcher, depositor);
    token.approve(tag_router.contract_address, 50000);
    stop_cheat_caller_address(token_dispatcher);

    start_cheat_caller_address(tag_router.contract_address, depositor);
    tag_router.register_tag('tag_owner');
    tag_router.deposit_to_tag('tag_owner', 10000, token_dispatcher);

    let recipient: ContractAddress = contract_address_const::<'recipient'>();
    tag_router.withdraw_from_wallet(token_dispatcher, 'tag_owner', recipient, 0);
    stop_cheat_caller_address(tag_router.contract_address);
}

#[test]
#[should_panic(expected: 'Token not supported')]
fn test_withdraw_unsupported_token_reverts() {
    let depositor: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, _, _) = deploy_contract();
    let rogue_token = deploy_mock_erc20("ROGUE");

    start_cheat_caller_address(tag_router.contract_address, depositor);
    tag_router.register_tag('tag_owner');

    let recipient: ContractAddress = contract_address_const::<'recipient'>();
    tag_router.withdraw_from_wallet(rogue_token.contract_address, 'tag_owner', recipient, 1000);
    stop_cheat_caller_address(tag_router.contract_address);
}

#[test]
fn test_admin_withdraw() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, token_dispatcher, _) = deploy_contract();
    let token = IERC20Dispatcher { contract_address: token_dispatcher };

    // Transfer some tokens directly to tag_router contract
    start_cheat_caller_address(token_dispatcher, admin);
    token.transfer(tag_router.contract_address, 5000);
    stop_cheat_caller_address(token_dispatcher);

    let recipient: ContractAddress = contract_address_const::<'recipient'>();

    start_cheat_caller_address(tag_router.contract_address, admin);
    let success = tag_router.withdraw(token_dispatcher, recipient, 5000);
    stop_cheat_caller_address(tag_router.contract_address);

    assert(success, 'Withdrawal should succeed');
    assert(token.balance_of(recipient) == 5000, 'Recipient balance wrong');
}

#[test]
#[should_panic(expected: 'Amount must be positive')]
fn test_admin_withdraw_zero_amount_reverts() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, token_dispatcher, _) = deploy_contract();
    let recipient: ContractAddress = contract_address_const::<'recipient'>();

    start_cheat_caller_address(tag_router.contract_address, admin);
    tag_router.withdraw(token_dispatcher, recipient, 0);
    stop_cheat_caller_address(tag_router.contract_address);
}

#[test]
#[should_panic(expected: 'Token not supported')]
fn test_admin_withdraw_unsupported_token_reverts() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let (tag_router, _, _) = deploy_contract();
    let rogue_token = deploy_mock_erc20("ROGUE");
    let recipient: ContractAddress = contract_address_const::<'recipient'>();

    start_cheat_caller_address(tag_router.contract_address, admin);
    tag_router.withdraw(rogue_token.contract_address, recipient, 100);
    stop_cheat_caller_address(tag_router.contract_address);
}


