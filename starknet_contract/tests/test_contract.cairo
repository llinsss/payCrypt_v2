use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_block_timestamp, stop_cheat_caller_address,
};
use staknet::contracts::main::{ITagRouterDispatcher, ITagRouterDispatcherTrait};
use staknet::contracts::mockusdc::{IExternalDispatcher, IExternalDispatcherTrait};
use staknet::contracts::wallet::{IWalletDispatcher, IWalletDispatcherTrait};
use starknet::{ClassHash, ContractAddress, contract_address_const, get_block_timestamp};


fn deploy_contract(name: ByteArray) -> ContractAddress {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let mut calldata = array![admin.into(), 6];
    let contract = declare(name).unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

fn deploy_erc20_contract() -> IExternalDispatcher {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    // Deploy mock ERC20
    let erc20_class = declare("MockUsdc").unwrap().contract_class();
    let mut calldata = array![admin.into(), 6];
    let (contract_address, _) = erc20_class.deploy(@calldata).unwrap();

    IExternalDispatcher { contract_address }
}


#[test]
fn test_contract_deployment() {
    let admin: ContractAddress = contract_address_const::<'admin'>();
    let contract_address = deploy_contract("TagRouter");
    let erc20_dispatcher = deploy_erc20_contract();
    let dispatcher = ITagRouterDispatcher { contract_address };

    let a = dispatcher.return_admin();
    assert(admin == a, 'Invalid balance');

    let name = erc20_dispatcher.nam();
    println!("print name {} :", name);
    assert(name == "USDC", 'Invalid name');
}

#[test]
fn test_register_tag() {
    let collins: ContractAddress = contract_address_const::<'collins'>();
    let contract_address = deploy_contract("TagRouter");
    let dispatcher = ITagRouterDispatcher { contract_address };
    let collins_address = dispatcher.register_tag('collins', collins);

    let collinsadd: felt252 = collins_address.into();

    println!("collins address {} :", collinsadd);

    let Collins = dispatcher.get_user('collins');
    assert(Collins.owner == collins, 'wrong address');
    assert(Collins.user_wallet == collins_address, 'wrong balance');
    assert(Collins.exists, 'exists');
}

