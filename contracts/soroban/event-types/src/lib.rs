use serde::Deserialize;

pub const CURRENT_SCHEMA_VERSION: u16 = 2;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct EventEnvelope {
    #[serde(alias = "id")]
    pub event_id: String,
    pub event_type: String,
    pub schema_version: u16,
    pub contract_id: String,
    pub ledger: u32,
    pub transaction_hash: String,
    pub operation_index: u32,
    pub event_index: u32,
    pub data: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct RegistryTagRegistered {
    pub tag: String,
    pub owner: String,
    pub wallet_id: String,
    #[serde(default)]
    pub created_at_ledger: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct WalletWithdrawalExecuted {
    pub proposal_id: u64,
    pub nonce: u64,
    pub destination: String,
    pub token: String,
    pub amount: i128,
    #[serde(default)]
    pub approval_count: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct EscrowReleased {
    pub escrow_id: String,
    pub sender: String,
    pub recipient: String,
    pub token: String,
    pub amount: i128,
    #[serde(default)]
    pub release_reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct PaymentSettled {
    pub payment_id: String,
    pub sender: String,
    pub recipient: String,
    pub token: String,
    pub amount: i128,
    #[serde(default)]
    pub memo: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum DecodedEvent {
    RegistryTagRegistered(EventEnvelope, RegistryTagRegistered),
    WalletWithdrawalExecuted(EventEnvelope, WalletWithdrawalExecuted),
    EscrowReleased(EventEnvelope, EscrowReleased),
    PaymentSettled(EventEnvelope, PaymentSettled),
}

#[derive(Debug)]
pub enum DecodeError {
    UnsupportedSchemaVersion(u16),
    UnknownEventType(String),
    InvalidPayload(serde_json::Error),
}

impl EventEnvelope {
    pub fn decode(self) -> Result<DecodedEvent, DecodeError> {
        if !(1..=CURRENT_SCHEMA_VERSION).contains(&self.schema_version) {
            return Err(DecodeError::UnsupportedSchemaVersion(self.schema_version));
        }
        let decoded = match self.event_type.as_str() {
            "registry_tag_registered" => {
                DecodedEvent::RegistryTagRegistered(self.clone(), decode_data(&self.data)?)
            }
            "wallet_withdrawal_executed" => DecodedEvent::WalletWithdrawalExecuted(
                self.clone(),
                decode_data(&self.data)?,
            ),
            "escrow_released" => {
                DecodedEvent::EscrowReleased(self.clone(), decode_data(&self.data)?)
            }
            "payment_settled" => {
                DecodedEvent::PaymentSettled(self.clone(), decode_data(&self.data)?)
            }
            other => return Err(DecodeError::UnknownEventType(other.to_owned())),
        };
        Ok(decoded)
    }
}

fn decode_data<T: for<'de> Deserialize<'de>>(value: &serde_json::Value) -> Result<T, DecodeError> {
    serde_json::from_value(value.clone()).map_err(DecodeError::InvalidPayload)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_fixture(source: &str) -> Vec<DecodedEvent> {
        serde_json::from_str::<Vec<EventEnvelope>>(source)
            .expect("fixture must parse")
            .into_iter()
            .map(|event| event.decode().expect("known versioned event"))
            .collect()
    }

    #[test]
    fn decodes_v1_and_v2_fixtures_with_stable_ids_and_field_meaning() {
        let v1 = decode_fixture(include_str!("../fixtures/events.v1.json"));
        let v2 = decode_fixture(include_str!("../fixtures/events.v2.json"));
        assert_eq!(v1.len(), 4);
        assert_eq!(v2.len(), 4);
        assert!(matches!(&v1[0], DecodedEvent::RegistryTagRegistered(envelope, data)
            if envelope.event_id == "tx-registry:0:0" && data.wallet_id == "CAWALLET1"));
        assert!(matches!(&v1[1], DecodedEvent::WalletWithdrawalExecuted(_, data)
            if data.amount == 250 && data.nonce == 7 && data.approval_count.is_none()));
        assert!(matches!(&v1[2], DecodedEvent::EscrowReleased(_, data)
            if data.amount == 400 && data.release_reason.is_none()));
        assert!(matches!(&v1[3], DecodedEvent::PaymentSettled(_, data)
            if data.amount == 500 && data.memo.is_none()));
        assert!(matches!(&v2[1], DecodedEvent::WalletWithdrawalExecuted(_, data)
            if data.amount == 250 && data.approval_count == Some(2)));
        assert!(matches!(&v2[2], DecodedEvent::EscrowReleased(_, data)
            if data.amount == 400 && data.release_reason.as_deref() == Some("condition_met")));
        assert!(matches!(&v2[3], DecodedEvent::PaymentSettled(_, data)
            if data.amount == 500 && data.memo.as_deref() == Some("invoice-8")));
    }

    #[test]
    fn rejects_unknown_versions_and_event_names() {
        let mut events: Vec<EventEnvelope> =
            serde_json::from_str(include_str!("../fixtures/events.v2.json")).expect("fixture parses");
        events[0].schema_version = 99;
        assert!(matches!(events.remove(0).decode(), Err(DecodeError::UnsupportedSchemaVersion(99))));

        let mut events: Vec<EventEnvelope> =
            serde_json::from_str(include_str!("../fixtures/events.v2.json")).expect("fixture parses");
        events[0].event_type = "registry_unknown".to_owned();
        assert!(matches!(events.remove(0).decode(), Err(DecodeError::UnknownEventType(_))));
    }
}