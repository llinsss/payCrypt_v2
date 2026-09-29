//! Typed Rust client for Stellar tag registration, resolution, escrow,
//! wallet balances, and withdrawals.
//!
//! Amounts and addresses are represented with newtypes so callers cannot
//! accidentally pass stringly typed values around.

use std::fmt;

/// A Stellar account address (e.g. `G...`).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Address(String);

impl Address {
    pub fn new(value: impl Into<String>) -> Result<Self, SdkError> {
        let value = value.into();
        if value.is_empty() {
            return Err(SdkError::InvalidAddress(value));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Address {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A tag name registered against an address.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Tag(String);

impl Tag {
    pub fn new(value: impl Into<String>) -> Result<Self, SdkError> {
        let value = value.into();
        if value.is_empty() {
            return Err(SdkError::InvalidTag(value));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Tag {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A non-negative amount expressed in stroops (1 XLM = 10_000_000 stroops).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Amount(i64);

impl Amount {
    pub const STROOPS_PER_XLM: i64 = 10_000_000;

    pub fn from_stroops(stroops: i64) -> Result<Self, SdkError> {
        if stroops < 0 {
            return Err(SdkError::InvalidAmount(stroops));
        }
        Ok(Self(stroops))
    }

    pub fn from_xlm(xlm: f64) -> Result<Self, SdkError> {
        if !xlm.is_finite() || xlm < 0.0 {
            return Err(SdkError::InvalidAmount(xlm as i64));
        }
        Self::from_stroops((xlm * Self::STROOPS_PER_XLM as f64).round() as i64)
    }

    pub fn stroops(&self) -> i64 {
        self.0
    }

    pub fn xlm(&self) -> f64 {
        self.0 as f64 / Self::STROOPS_PER_XLM as f64
    }
}

impl fmt::Display for Amount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} stroops", self.0)
    }
}

/// Typed errors returned by the SDK.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SdkError {
    InvalidAddress(String),
    InvalidTag(String),
    InvalidAmount(i64),
    NotFound(String),
    Transport(String),
}

impl fmt::Display for SdkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SdkError::InvalidAddress(v) => write!(f, "invalid address: {v}"),
            SdkError::InvalidTag(v) => write!(f, "invalid tag: {v}"),
            SdkError::InvalidAmount(v) => write!(f, "invalid amount: {v}"),
            SdkError::NotFound(v) => write!(f, "not found: {v}"),
            SdkError::Transport(v) => write!(f, "transport error: {v}"),
        }
    }
}

impl std::error::Error for SdkError {}

/// Request to register a tag for an address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterTagRequest {
    pub tag: Tag,
    pub owner: Address,
}

/// Response returned after a successful tag registration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterTagResponse {
    pub tag: Tag,
    pub owner: Address,
}

/// Request to resolve a tag to its owning address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolveTagRequest {
    pub tag: Tag,
}

/// Response containing the resolved address for a tag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolveTagResponse {
    pub tag: Tag,
    pub owner: Address,
}

/// Request to create an escrow between two addresses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateEscrowRequest {
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
}

/// Response describing a created escrow.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateEscrowResponse {
    pub escrow_id: String,
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
}

/// Request for the balances held by an address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletBalancesRequest {
    pub owner: Address,
}

/// Response containing wallet balances.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletBalancesResponse {
    pub owner: Address,
    pub available: Amount,
    pub escrowed: Amount,
}

/// Request to withdraw funds from a wallet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WithdrawRequest {
    pub owner: Address,
    pub destination: Address,
    pub amount: Amount,
}

/// Response describing a completed withdrawal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WithdrawResponse {
    pub owner: Address,
    pub destination: Address,
    pub amount: Amount,
}

/// Transport abstraction so the SDK can run against a mock server or testnet.
pub trait Transport {
    fn register_tag(
        &self,
        request: RegisterTagRequest,
    ) -> Result<RegisterTagResponse, SdkError>;
    fn resolve_tag(&self, request: ResolveTagRequest) -> Result<ResolveTagResponse, SdkError>;
    fn create_escrow(
        &self,
        request: CreateEscrowRequest,
    ) -> Result<CreateEscrowResponse, SdkError>;
    fn wallet_balances(
        &self,
        request: WalletBalancesRequest,
    ) -> Result<WalletBalancesResponse, SdkError>;
    fn withdraw(&self, request: WithdrawRequest) -> Result<WithdrawResponse, SdkError>;
}

/// Typed client exposing tag and payment operations.
pub struct Client<T: Transport> {
    transport: T,
}

impl<T: Transport> Client<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    pub fn register_tag(
        &self,
        request: RegisterTagRequest,
    ) -> Result<RegisterTagResponse, SdkError> {
        self.transport.register_tag(request)
    }

    pub fn resolve_tag(&self, request: ResolveTagRequest) -> Result<ResolveTagResponse, SdkError> {
        self.transport.resolve_tag(request)
    }

    pub fn create_escrow(
        &self,
        request: CreateEscrowRequest,
    ) -> Result<CreateEscrowResponse, SdkError> {
        self.transport.create_escrow(request)
    }

    pub fn wallet_balances(
        &self,
        request: WalletBalancesRequest,
    ) -> Result<WalletBalancesResponse, SdkError> {
        self.transport.wallet_balances(request)
    }

    pub fn withdraw(&self, request: WithdrawRequest) -> Result<WithdrawResponse, SdkError> {
        self.transport.withdraw(request)
    }
}

/// In-memory transport used by the mock-server integration example.
#[derive(Debug, Default)]
pub struct MockTransport {
    tags: std::collections::HashMap<String, Address>,
    balances: std::collections::HashMap<String, Amount>,
}

impl MockTransport {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Transport for MockTransport {
    fn register_tag(
        &self,
        request: RegisterTagRequest,
    ) -> Result<RegisterTagResponse, SdkError> {
        Ok(RegisterTagResponse {
            tag: request.tag,
            owner: request.owner,
        })
    }

    fn resolve_tag(&self, request: ResolveTagRequest) -> Result<ResolveTagResponse, SdkError> {
        match self.tags.get(request.tag.as_str()) {
            Some(owner) => Ok(ResolveTagResponse {
                tag: request.tag,
                owner: owner.clone(),
            }),
            None => Err(SdkError::NotFound(request.tag.as_str().to_string())),
        }
    }

    fn create_escrow(
        &self,
        request: CreateEscrowRequest,
    ) -> Result<CreateEscrowResponse, SdkError> {
        Ok(CreateEscrowResponse {
            escrow_id: format!("escrow-{}-{}", request.from, request.to),
            from: request.from,
            to: request.to,
            amount: request.amount,
        })
    }

    fn wallet_balances(
        &self,
        request: WalletBalancesRequest,
    ) -> Result<WalletBalancesResponse, SdkError> {
        let available = self
            .balances
            .get(request.owner.as_str())
            .copied()
            .unwrap_or_else(|| Amount::from_stroops(0).expect("zero is valid"));
        Ok(WalletBalancesResponse {
            owner: request.owner,
            available,
            escrowed: Amount::from_stroops(0).expect("zero is valid"),
        })
    }

    fn withdraw(&self, request: WithdrawRequest) -> Result<WithdrawResponse, SdkError> {
        Ok(WithdrawResponse {
            owner: request.owner,
            destination: request.destination,
            amount: request.amount,
        })
    }
}

/// Example: drive the SDK against the in-memory mock server.
pub fn mock_server_example() -> Result<(), SdkError> {
    let client = Client::new(MockTransport::new());
    let owner = Address::new("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")?;
    let tag = Tag::new("alice")?;

    client.register_tag(RegisterTagRequest {
        tag: tag.clone(),
        owner: owner.clone(),
    })?;

    let resolved = client.resolve_tag(ResolveTagRequest { tag })?;
    assert_eq!(resolved.owner, owner);

    let balances = client.wallet_balances(WalletBalancesRequest {
        owner: owner.clone(),
    })?;
    assert_eq!(balances.available.stroops(), 0);

    Ok(())
}

/// Example: drive the SDK against Stellar testnet using a custom transport.
pub fn testnet_example<T: Transport>(client: Client<T>) -> Result<(), SdkError> {
    let owner = Address::new("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")?;
    let destination = Address::new("GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")?;
    let amount = Amount::from_xlm(1.5)?;

    client.create_escrow(CreateEscrowRequest {
        from: owner.clone(),
        to: destination.clone(),
        amount,
    })?;

    client.withdraw(WithdrawRequest {
        owner,
        destination,
        amount,
    })?;

    Ok(())
}
