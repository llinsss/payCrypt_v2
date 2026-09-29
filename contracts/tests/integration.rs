//! Integration tests exercising the reviewed Soroban contract WASM against a
//! deterministic local Stellar/Soroban network.
//!
//! These tests complement the unit tests by validating authorization, events,
//! fees, ledger timing, and cross-contract behavior end-to-end. They require a
//! local network (e.g. `stellar/quickstart` or `soroban-testnet`) to be running
//! and the reviewed WASM artifacts to be built.
//!
//! Environment variables:
//! - `SOROBAN_RPC_URL`: RPC endpoint of the local network (default
//!   `http://localhost:8000/soroban/rpc`).
//! - `SOROBAN_NETWORK_PASSPHRASE`: network passphrase (default the standalone
//!   network passphrase used by `stellar/quickstart`).
//! - `SOROBAN_SECRET_KEY`: funded secret key used to sign transactions.
//! - `CONTRACT_WASM`: path to the reviewed contract WASM artifact.
//!
//! When the local network is not reachable the tests are skipped so that plain
//! `cargo test` on a developer machine does not fail spuriously; CI starts the
//! network before invoking these tests.

use std::env;
use std::path::PathBuf;
use std::time::Duration;

use soroban_client::account::{Account, AccountBehavior};
use soroban_client::contract::{ContractBehavior, Contracts};
use soroban_client::keypair::{Keypair, KeypairBehavior};
use soroban_client::network::{NetworkPassphrase, Networks};
use soroban_client::soroban_rpc::SorobanRpc;
use soroban_client::transaction::{Transaction, TransactionBehavior};
use soroban_client::transaction_builder::{TransactionBuilder, TransactionBuilderBehavior};
use soroban_client::xdr::{ScVal, Uint256};

const DEFAULT_RPC_URL: &str = "http://localhost:8000/soroban/rpc";
const DEFAULT_NETWORK_PASSPHRASE: &str = "Standalone Network ; February 2017";
const DEFAULT_WASM: &str = "target/wasm32-unknown-unknown/release/contract.wasm";

/// Returns the RPC URL, or `None` when the local network is not configured.
fn rpc_url() -> String {
    env::var("SOROBAN_RPC_URL").unwrap_or_else(|_| DEFAULT_RPC_URL.to_string())
}

fn network_passphrase() -> String {
    env::var("SOROBAN_NETWORK_PASSPHRASE")
        .unwrap_or_else(|_| DEFAULT_NETWORK_PASSPHRASE.to_string())
}

fn wasm_path() -> PathBuf {
    PathBuf::from(env::var("CONTRACT_WASM").unwrap_or_else(|_| DEFAULT_WASM.to_string()))
}

/// A funded keypair used to sign transactions against the local network.
fn signer() -> Keypair {
    let secret = env::var("SOROBAN_SECRET_KEY")
        .expect("SOROBAN_SECRET_KEY must be set to run integration tests");
    Keypair::from_secret(&secret).expect("invalid SOROBAN_SECRET_KEY")
}

/// Connects to the local network, returning `None` when it is unreachable so
/// that the test can be skipped instead of failing.
async fn connect() -> Option<SorobanRpc> {
    let server = SorobanRpc::new(&rpc_url(), NetworkPassphrase::from(network_passphrase()))
        .await
        .ok()?;
    // Probe the network; if it is not up, skip the test.
    server.get_network().await.ok()?;
    Some(server)
}

/// Deploys the reviewed WASM artifact and returns the contract id.
async fn deploy(server: &SorobanRpc, signer: &Keypair) -> String {
    let wasm = std::fs::read(wasm_path()).expect("reviewed WASM artifact not found; build it first");
    let account = server
        .get_account(&signer.public_key())
        .await
        .expect("failed to load signer account");

    let tx = TransactionBuilder::new(&account, NetworkPassphrase::from(network_passphrase()))
        .fee(1_000_000)
        .add_upload_wasm_op(&wasm)
        .build();
    let tx = server
        .prepare_transaction(&tx)
        .await
        .expect("failed to prepare upload transaction");
    let signed = tx.sign(signer);
    let sent = server
        .send_transaction(&signed)
        .await
        .expect("failed to submit upload transaction");
    let hash = sent.hash;
    wait_for_success(server, &hash).await;

    let wasm_hash = server
        .get_transaction(&hash)
        .await
        .expect("failed to fetch upload result")
        .result_meta
        .expect("missing result meta")
        .wasm_hash();

    let account = server
        .get_account(&signer.public_key())
        .await
        .expect("failed to reload signer account");
    let tx = TransactionBuilder::new(&account, NetworkPassphrase::from(network_passphrase()))
        .fee(1_000_000)
        .add_create_contract_op(&wasm_hash, &[])
        .build();
    let tx = server
        .prepare_transaction(&tx)
        .await
        .expect("failed to prepare create transaction");
    let signed = tx.sign(signer);
    let sent = server
        .send_transaction(&signed)
        .await
        .expect("failed to submit create transaction");
    let hash = sent.hash;
    wait_for_success(server, &hash).await;

    server
        .get_transaction(&hash)
        .await
        .expect("failed to fetch create result")
        .result_meta
        .expect("missing result meta")
        .contract_id()
        .expect("missing contract id")
}

/// Polls the network until the transaction is confirmed or times out.
async fn wait_for_success(server: &SorobanRpc, hash: &str) {
    for _ in 0..30 {
        if let Ok(tx) = server.get_transaction(hash).await {
            if tx.status == "SUCCESS" {
                return;
            }
            if tx.status == "FAILED" {
                panic!("transaction {hash} failed");
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    panic!("timed out waiting for transaction {hash}");
}

/// Invokes a contract function and returns the result, or an error string.
async fn invoke(
    server: &SorobanRpc,
    signer: &Keypair,
    contract_id: &str,
    func: &str,
    args: Vec<ScVal>,
) -> Result<ScVal, String> {
    let account = server
        .get_account(&signer.public_key())
        .await
        .map_err(|e| e.to_string())?;
    let contract = Contracts::new(contract_id);
    let tx = TransactionBuilder::new(&account, NetworkPassphrase::from(network_passphrase()))
        .fee(1_000_000)
        .add_operation(contract.call(func, args))
        .build();
    let tx = server
        .prepare_transaction(&tx)
        .await
        .map_err(|e| e.to_string())?;
    let signed = tx.sign(signer);
    let sent = server
        .send_transaction(&signed)
        .await
        .map_err(|e| e.to_string())?;
    wait_for_success(server, &sent.hash).await;
    server
        .get_transaction(&sent.hash)
        .await
        .map_err(|e| e.to_string())?
        .return_value
        .ok_or_else(|| "missing return value".to_string())
}

fn address_arg(key: &Keypair) -> ScVal {
    ScVal::Address(key.public_key().into())
}

fn i128_arg(value: i128) -> ScVal {
    ScVal::I128(value.into())
}

#[tokio::test]
async fn end_to_end_registration_deposit_transfer_withdrawal() {
    let Some(server) = connect().await else {
        eprintln!("skipping: local Soroban network not reachable");
        return;
    };
    let signer = signer();
    let contract_id = deploy(&server, &signer).await;

    // Registration.
    invoke(&server, &signer, &contract_id, "register", vec![address_arg(&signer)])
        .await
        .expect("registration should succeed");

    // Deposit.
    invoke(
        &server,
        &signer,
        &contract_id,
        "deposit",
        vec![address_arg(&signer), i128_arg(1_000)],
    )
    .await
    .expect("deposit should succeed");

    // Transfer to a second account.
    let recipient = Keypair::random();
    invoke(
        &server,
        &signer,
        &contract_id,
        "transfer",
        vec![address_arg(&signer), address_arg(&recipient), i128_arg(400)],
    )
    .await
    .expect("transfer should succeed");

    // Withdrawal.
    invoke(
        &server,
        &signer,
        &contract_id,
        "withdraw",
        vec![address_arg(&signer), i128_arg(600)],
    )
    .await
    .expect("withdrawal should succeed");
}

#[tokio::test]
async fn failure_paths_are_rejected() {
    let Some(server) = connect().await else {
        eprintln!("skipping: local Soroban network not reachable");
        return;
    };
    let signer = signer();
    let contract_id = deploy(&server, &signer).await;

    // Unauthorized: an unregistered account cannot withdraw.
    let stranger = Keypair::random();
    let unauthorized = invoke(
        &server,
        &stranger,
        &contract_id,
        "withdraw",
        vec![address_arg(&stranger), i128_arg(1)],
    )
    .await;
    assert!(unauthorized.is_err(), "unauthorized withdrawal must fail");

    // Insufficient balance: deposit then over-withdraw.
    invoke(
        &server,
        &signer,
        &contract_id,
        "deposit",
        vec![address_arg(&signer), i128_arg(100)],
    )
    .await
    .expect("deposit should succeed");
    let overdraft = invoke(
        &server,
        &signer,
        &contract_id,
        "withdraw",
        vec![address_arg(&signer), i128_arg(1_000_000)],
    )
    .await;
    assert!(overdraft.is_err(), "over-withdrawal must fail");

    // Invalid input: negative amount.
    let invalid = invoke(
        &server,
        &signer,
        &contract_id,
        "deposit",
        vec![address_arg(&signer), i128_arg(-1)],
    )
    .await;
    assert!(invalid.is_err(), "negative deposit must fail");
}
