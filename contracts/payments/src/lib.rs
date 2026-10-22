#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, Env, Map, Symbol, Vec};

/// Maximum number of metadata entries allowed per payment.
pub const MAX_METADATA_ENTRIES: u32 = 16;
/// Maximum byte length of a metadata key.
pub const MAX_KEY_LEN: u32 = 32;
/// Maximum byte length of a metadata value.
pub const MAX_VALUE_LEN: u32 = 128;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PaymentError {
    NotInitialized = 1,
    Unauthorized = 2,
    PaymentNotFound = 3,
    TooManyEntries = 4,
    KeyTooLong = 5,
    ValueTooLong = 6,
    EmptyKey = 7,
    DuplicateKey = 8,
    NonCanonicalOrder = 9,
    Replay = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataEntry {
    pub key: Bytes,
    pub value: Bytes,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentMetadata {
    pub payment_id: u64,
    pub entries: Vec<MetadataEntry>,
    pub version: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payment {
    pub id: u64,
    pub owner: Address,
    pub metadata: PaymentMetadata,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Payment(u64),
    Nonce(Address, u64),
}

#[contract]
pub struct PaymentsContract;

fn validate_metadata(env: &Env, entries: &Vec<MetadataEntry>) -> Result<(), PaymentError> {
    if entries.len() > MAX_METADATA_ENTRIES {
        return Err(PaymentError::TooManyEntries);
    }
    let mut prev: Option<Bytes> = None;
    for i in 0..entries.len() {
        let entry = entries.get(i).unwrap();
        if entry.key.len() == 0 {
            return Err(PaymentError::EmptyKey);
        }
        if entry.key.len() > MAX_KEY_LEN {
            return Err(PaymentError::KeyTooLong);
        }
        if entry.value.len() > MAX_VALUE_LEN {
            return Err(PaymentError::ValueTooLong);
        }
        if let Some(ref p) = prev {
            let cmp = compare_bytes(env, p, &entry.key);
            if cmp == 0 {
                return Err(PaymentError::DuplicateKey);
            }
            if cmp > 0 {
                return Err(PaymentError::NonCanonicalOrder);
            }
        }
        prev = Some(entry.key.clone());
    }
    Ok(())
}

fn compare_bytes(env: &Env, a: &Bytes, b: &Bytes) -> i32 {
    let al = a.len();
    let bl = b.len();
    let min = if al < bl { al } else { bl };
    let mut i = 0u32;
    while i < min {
        let av = a.get(i).unwrap();
        let bv = b.get(i).unwrap();
        if av < bv {
            return -1;
        }
        if av > bv {
            return 1;
        }
        i += 1;
    }
    let _ = env;
    if al < bl {
        -1
    } else if al > bl {
        1
    } else {
        0
    }
}

#[contractimpl]
impl PaymentsContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn create_payment(
        env: Env,
        owner: Address,
        payment_id: u64,
        entries: Vec<MetadataEntry>,
    ) -> Result<(), PaymentError> {
        owner.require_auth();
        validate_metadata(&env, &entries)?;
        let key = DataKey::Payment(payment_id);
        if env.storage().persistent().has(&key) {
            return Err(PaymentError::Replay);
        }
        let metadata = PaymentMetadata {
            payment_id,
            entries: entries.clone(),
            version: 1,
        };
        let payment = Payment {
            id: payment_id,
            owner: owner.clone(),
            metadata,
        };
        env.storage().persistent().set(&key, &payment);
        env.events()
            .publish((symbol_short!("payment"), symbol_short!("created")), (payment_id, owner, entries.len()));
        Ok(())
    }

    pub fn update_metadata(
        env: Env,
        owner: Address,
        payment_id: u64,
        entries: Vec<MetadataEntry>,
    ) -> Result<(), PaymentError> {
        owner.require_auth();
        validate_metadata(&env, &entries)?;
        let key = DataKey::Payment(payment_id);
        let mut payment: Payment = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(PaymentError::PaymentNotFound)?;
        if payment.owner != owner {
            return Err(PaymentError::Unauthorized);
        }
        payment.metadata.entries = entries.clone();
        payment.metadata.version += 1;
        let version = payment.metadata.version;
        env.storage().persistent().set(&key, &payment);
        env.events().publish(
            (symbol_short!("payment"), symbol_short!("updated")),
            (payment_id, owner, version, entries.len()),
        );
        Ok(())
    }

    pub fn get_payment(env: Env, payment_id: u64) -> Result<Payment, PaymentError> {
        env.storage()
            .persistent()
            .get(&DataKey::Payment(payment_id))
            .ok_or(PaymentError::PaymentNotFound)
    }

    pub fn get_metadata(env: Env, payment_id: u64) -> Result<PaymentMetadata, PaymentError> {
        let payment: Payment = env
            .storage()
            .persistent()
            .get(&DataKey::Payment(payment_id))
            .ok_or(PaymentError::PaymentNotFound)?;
        Ok(payment.metadata)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Bytes, Env, Vec};

    fn entry(env: &Env, k: &[u8], v: &[u8]) -> MetadataEntry {
        MetadataEntry {
            key: Bytes::from_slice(env, k),
            value: Bytes::from_slice(env, v),
        }
    }

    fn setup() -> (Env, PaymentsContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PaymentsContract);
        let client = PaymentsContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        (env, client, owner)
    }

    #[test]
    fn success_create_and_update() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        entries.push_back(entry(&env, b"a", b"1"));
        entries.push_back(entry(&env, b"b", b"2"));
        client.create_payment(&owner, &1u64, &entries);
        let md = client.get_metadata(&1u64);
        assert_eq!(md.entries.len(), 2);
        assert_eq!(md.version, 1);

        let mut updated = Vec::new(&env);
        updated.push_back(entry(&env, b"a", b"9"));
        client.update_metadata(&owner, &1u64, &updated);
        let md2 = client.get_metadata(&1u64);
        assert_eq!(md2.version, 2);
    }

    #[test]
    fn boundary_max_entries() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        for i in 0..MAX_METADATA_ENTRIES {
            let mut k = [0u8; 2];
            k[0] = b'a';
            k[1] = b'a' + (i as u8);
            entries.push_back(entry(&env, &k, b"v"));
        }
        client.create_payment(&owner, &1u64, &entries);
        assert_eq!(client.get_metadata(&1u64).entries.len(), MAX_METADATA_ENTRIES);
    }

    #[test]
    fn failure_too_many_entries() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        for i in 0..(MAX_METADATA_ENTRIES + 1) {
            let mut k = [0u8; 2];
            k[0] = b'a';
            k[1] = b'a' + (i as u8);
            entries.push_back(entry(&env, &k, b"v"));
        }
        let res = client.try_create_payment(&owner, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::TooManyEntries)));
    }

    #[test]
    fn failure_key_too_long() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        let long_key = [b'k'; (MAX_KEY_LEN + 1) as usize];
        entries.push_back(entry(&env, &long_key, b"v"));
        let res = client.try_create_payment(&owner, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::KeyTooLong)));
    }

    #[test]
    fn failure_value_too_long() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        let long_val = [b'v'; (MAX_VALUE_LEN + 1) as usize];
        entries.push_back(entry(&env, b"k", &long_val));
        let res = client.try_create_payment(&owner, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::ValueTooLong)));
    }

    #[test]
    fn failure_non_canonical_order() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        entries.push_back(entry(&env, b"b", b"1"));
        entries.push_back(entry(&env, b"a", b"2"));
        let res = client.try_create_payment(&owner, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::NonCanonicalOrder)));
    }

    #[test]
    fn failure_duplicate_key() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        entries.push_back(entry(&env, b"a", b"1"));
        entries.push_back(entry(&env, b"a", b"2"));
        let res = client.try_create_payment(&owner, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::DuplicateKey)));
    }

    #[test]
    fn failure_replay_create() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        entries.push_back(entry(&env, b"a", b"1"));
        client.create_payment(&owner, &1u64, &entries);
        let res = client.try_create_payment(&owner, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::Replay)));
    }

    #[test]
    fn failure_unauthorized_update() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        entries.push_back(entry(&env, b"a", b"1"));
        client.create_payment(&owner, &1u64, &entries);
        let attacker = Address::generate(&env);
        let res = client.try_update_metadata(&attacker, &1u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::Unauthorized)));
    }

    #[test]
    fn failure_missing_payment() {
        let (env, client, owner) = setup();
        let mut entries = Vec::new(&env);
        entries.push_back(entry(&env, b"a", b"1"));
        let res = client.try_update_metadata(&owner, &99u64, &entries);
        assert_eq!(res, Err(Ok(PaymentError::PaymentNotFound)));
    }
}
