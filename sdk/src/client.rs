//! Typed Rust client for the Stellar tags and payments SDK.
//!
//! This module exposes strongly typed request/response/error models for tag
//! registration, tag resolution, escrow, wallet balances, and withdrawals.
//! Amounts and addresses are wrapped in newtypes so callers cannot pass
//! stringly typed values by accident.

use std::fmt;

use serde::{Deserialize, Serialize};

/// A Stellar account address (e.g. `G...`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Address(String);

impl Address {
    /// Wrap a raw Stellar address string.
    pub fn new(raw: impl Into<String>) -> Self {
        Address(raw.into())
    }

    /// Borrow the underlying address string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Address {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<&str> for Address {
    fn from(value: &str) -> Self {
        Address::new(value)
    }
}

impl From<String> for Address {
    fn from(value: String) -> Self {
        Address::new(value)
    }
}

/// A tag name registered against an address.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Tag(String);

impl Tag {
    /// Wrap a raw tag string.
    pub fn new(raw: impl Into<String>) -> Self {
        Tag(raw.into())
    }

    /// Borrow the underlying tag string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Tag {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<&str> for Tag {
    fn from(value: &str) -> Self {
        Tag::new(value)
    }
}

impl From<String> for Tag {
    fn from(value: String) -> Self {
        Tag::new(value)
    }
}

/// A non-negative amount expressed in stroops (1 XLM = 10_000_000 stroops).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Amount(i64);

impl Amount {
    /// Construct an amount from a stroop count.
    pub fn from_stroops(stroops: i64) -> Self {
        Amount(stroops)
    }

    /// Construct an amount from whole XLM.
    pub fn from_xlm(xlm: i64) -> Self {
        Amount(xlm.saturating_mul(10_000_000))
    }

    /// The amount in stroops.
    pub fn stroops(&self) -> i64 {
        self.0
    }
}

impl fmt::Display for Amount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Request to register a tag for an address.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterTagRequest {
    pub tag: Tag,
    pub owner: Address,
}

/// Response returned after a successful tag registration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterTagResponse {
    pub tag: Tag,
    pub owner: Address,
}

/// Request to resolve a tag to its owning address.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveTagRequest {
    pub tag: Tag,
}

/// Response containing the resolved address for a tag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveTagResponse {
    pub tag: Tag,
    pub owner: Address,
}

/// Request to create an escrow between two parties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEscrowRequest {
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
}

/// Response describing a created escrow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEscrowResponse {
    pub escrow_id: String,
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
}

/// Request to fetch the wallet balance for an address.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBalanceRequest {
    pub address: Address,
}

/// Response containing the wallet balance for an address.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBalanceResponse {
    pub address: Address,
    pub balance: Amount,
}

/// Request to withdraw funds from a wallet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawRequest {
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
}

/// Response describing a completed withdrawal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawResponse {
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
}

/// Errors surfaced by the SDK client.
#[derive(Debug)]
pub enum SdkError {
    /// The transport failed before a response was received.
    Transport(String),
    /// The server returned a non-success status.
    Api { status: u16, message: String },
    /// The response body could not be decoded.
    Decode(String),
}

impl fmt::Display for SdkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SdkError::Transport(msg) => write!(f, "transport error: {msg}"),
            SdkError::Api { status, message } => {
                write!(f, "api error ({status}): {message}")
            }
            SdkError::Decode(msg) => write!(f, "decode error: {msg}"),
        }
    }
}

impl std::error::Error for SdkError {}

/// Result alias used throughout the SDK.
pub type SdkResult<T> = Result<T, SdkError>;

/// Transport abstraction so the client can run against a mock server or testnet.
pub trait Transport {
    fn post<Req, Res>(&self, path: &str, request: &Req) -> SdkResult<Res>
    where
        Req: Serialize,
        Res: for<'de> Deserialize<'de>;
}

/// Typed client for tag registration, resolution, escrow, balances, and withdrawals.
pub struct Client<T: Transport> {
    transport: T,
}

impl<T: Transport> Client<T> {
    /// Build a client over the given transport.
    pub fn new(transport: T) -> Self {
        Client { transport }
    }

    /// Register a tag for an address.
    pub fn register_tag(&self, request: &RegisterTagRequest) -> SdkResult<RegisterTagResponse> {
        self.transport.post("/tags/register", request)
    }

    /// Resolve a tag to its owning address.
    pub fn resolve_tag(&self, request: &ResolveTagRequest) -> SdkResult<ResolveTagResponse> {
        self.transport.post("/tags/resolve", request)
    }

    /// Create an escrow between two parties.
    pub fn create_escrow(&self, request: &CreateEscrowRequest) -> SdkResult<CreateEscrowResponse> {
        self.transport.post("/escrow/create", request)
    }

    /// Fetch the wallet balance for an address.
    pub fn wallet_balance(
        &self,
        request: &WalletBalanceRequest,
    ) -> SdkResult<WalletBalanceResponse> {
        self.transport.post("/wallet/balance", request)
    }

    /// Withdraw funds from a wallet.
    pub fn withdraw(&self, request: &WithdrawRequest) -> SdkResult<WithdrawResponse> {
        self.transport.post("/wallet/withdraw", request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    /// In-memory mock server used by the mock-server integration example.
    #[derive(Default)]
    struct MockServer {
        calls: RefCell<Vec<String>>,
        responses: RefCell<HashMap<String, String>>,
    }

    impl MockServer {
        fn respond(&self, path: &str, body: &str) {
            self.responses
                .borrow_mut()
                .insert(path.to_string(), body.to_string());
        }
    }

    impl Transport for MockServer {
        fn post<Req, Res>(&self, path: &str, _request: &Req) -> SdkResult<Res>
        where
            Req: Serialize,
            Res: for<'de> Deserialize<'de>,
        {
            self.calls.borrow_mut().push(path.to_string());
            let body = self
                .responses
                .borrow()
                .get(path)
                .cloned()
                .ok_or_else(|| SdkError::Api {
                    status: 404,
                    message: format!("no mock response for {path}"),
                })?;
            serde_json::from_str(&body).map_err(|err| SdkError::Decode(err.to_string()))
        }
    }

    #[test]
    fn mock_server_round_trip() {
        let server = MockServer::default();
        server.respond(
            "/tags/register",
            r#"{"tag":"alice","owner":"GALICE"}"#,
        );
        server.respond(
            "/wallet/balance",
            r#"{"address":"GALICE","balance":10000000}"#,
        );

        let client = Client::new(server);
        let registered = client
            .register_tag(&RegisterTagRequest {
                tag: Tag::new("alice"),
                owner: Address::new("GALICE"),
            })
            .expect("register tag");
        assert_eq!(registered.tag.as_str(), "alice");

        let balance = client
            .wallet_balance(&WalletBalanceRequest {
                address: Address::new("GALICE"),
            })
            .expect("wallet balance");
        assert_eq!(balance.balance, Amount::from_xlm(1));
    }

    #[test]
    fn typed_amounts_avoid_stringly_values() {
        assert_eq!(Amount::from_xlm(2).stroops(), 20_000_000);
        assert_eq!(Amount::from_stroops(5).to_string(), "5");
    }
}
