'use strict';

const { Model, DataTypes } = require('sequelize');

/**
 * MultiSigPayment
 *
 * Represents a payment request that requires multiple signers before
 * the transaction can be submitted to the Stellar network.
 *
 * Status lifecycle:
 *   pending  → collecting signatures
 *   ready    → threshold met, awaiting submission
 *   submitted → submitted to Stellar network
 *   expired  → 24 h window elapsed without reaching threshold
 *   failed   → submission to network failed
 */
class MultiSigPayment extends Model {
  static associate(models) {
    MultiSigPayment.hasMany(models.MultiSigSignature, {
      foreignKey: 'multi_sig_payment_id',
      as: 'signatures',
    });
  }

  /** Convenience: has enough signatures been collected? */
  get isThresholdMet() {
    const count = this.collected_signatures_count ?? 0;
    return count >= this.required_signatures;
  }

  /** Convenience: is the request still accepting signatures? */
  get isAcceptingSignatures() {
    return (
      this.status === 'pending' &&
      new Date() < new Date(this.expires_at)
    );
  }
}

module.exports = (sequelize) => {
  MultiSigPayment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      // Human-readable reference (e.g. PAY-2024-001)
      payment_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },

      // Source Stellar account (G…)
      source_account: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { len: [56, 56] },
      },

      // Destination Stellar account (G…)
      destination_account: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { len: [56, 56] },
      },

      // Payment amount in the asset's base unit (e.g. "100.00")
      amount: {
        type: DataTypes.DECIMAL(20, 7),
        allowNull: false,
        validate: { min: 0.0000001 },
      },

      // Asset code (e.g. "XLM", "USDC")
      asset_code: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'XLM',
      },

      // Asset issuer public key (null for XLM)
      asset_issuer: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },

      // Optional memo attached to the Stellar transaction
      memo: {
        type: DataTypes.STRING(28),
        allowNull: true,
      },

      // How many signatures are required before submission
      required_signatures: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 2, max: 10 },
      },

      // How many valid signatures have been collected so far (denormalised counter)
      collected_signatures_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      // JSON array of public keys that are allowed to sign (authorised signers)
      authorized_signers: {
        type: DataTypes.JSON,
        allowNull: false,
        validate: {
          isValidSignerList(value) {
            if (!Array.isArray(value) || value.length < 2) {
              throw new Error('authorized_signers must be an array of at least 2 public keys');
            }
          },
        },
      },

      // Base-64 encoded unsigned transaction XDR
      unsigned_xdr: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Base-64 encoded fully-signed transaction XDR (set once threshold is met)
      signed_xdr: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Stellar transaction hash (set after successful network submission)
      stellar_tx_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
      },

      // Workflow status
      status: {
        type: DataTypes.ENUM('pending', 'ready', 'submitted', 'expired', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },

      // Details about a failure (network error, invalid XDR, etc.)
      failure_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Public key of the admin who created the request
      created_by: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },

      // BullMQ job ID for the expiry delayed job (used to cancel if submitted early)
      expiry_job_id: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },

      // Hard deadline — request expires if threshold not met by this time
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      // When the threshold was first reached
      threshold_met_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      // When the transaction was submitted to the Stellar network
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'MultiSigPayment',
      tableName: 'multi_sig_payments',
      underscored: true,
      timestamps: true, // adds created_at / updated_at
      indexes: [
        { fields: ['payment_id'] },
        { fields: ['status'] },
        { fields: ['expires_at'] },
        { fields: ['created_by'] },
        { fields: ['stellar_tx_hash'], where: { stellar_tx_hash: { [require('sequelize').Op.ne]: null } } },
      ],
    }
  );

  return MultiSigPayment;
};
