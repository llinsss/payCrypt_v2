'use strict';

const { Model, DataTypes } = require('sequelize');

/**
 * MultiSigSignature
 *
 * One row per signer who has submitted their signature for a
 * MultiSigPayment.  The `signature` column stores the raw decorated
 * signature bytes as a hex string so they can be re-applied to the
 * base transaction XDR during final assembly.
 */
class MultiSigSignature extends Model {
  static associate(models) {
    MultiSigSignature.belongsTo(models.MultiSigPayment, {
      foreignKey: 'multi_sig_payment_id',
      as: 'payment',
    });
  }
}

module.exports = (sequelize) => {
  MultiSigSignature.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      // FK → MultiSigPayment.id
      multi_sig_payment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'multi_sig_payments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      // Stellar public key (G…) of the signer
      signer_public_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { len: [56, 56] },
      },

      // Hex-encoded raw signature bytes (ed25519, 64 bytes → 128 hex chars)
      signature: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },

      // The full signed XDR envelope submitted by this signer (base64).
      // We store the whole envelope so we can extract + verify the
      // DecoratedSignature even after the original unsigned XDR is gone.
      signed_envelope_xdr: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      // When the signer submitted their signature
      signed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      // IP address of the request (for audit trail)
      ip_address: {
        type: DataTypes.STRING(45), // IPv6 max length
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'MultiSigSignature',
      tableName: 'multi_sig_signatures',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['multi_sig_payment_id'] },
        { fields: ['signer_public_key'] },
        // Prevent a signer from signing the same payment twice
        {
          unique: true,
          fields: ['multi_sig_payment_id', 'signer_public_key'],
          name: 'unique_signature_per_payment_signer',
        },
      ],
    }
  );

  return MultiSigSignature;
};
