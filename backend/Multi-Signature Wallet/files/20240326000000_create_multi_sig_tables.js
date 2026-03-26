'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── multi_sig_payments ──────────────────────────────────────────────────
    await queryInterface.createTable('multi_sig_payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      payment_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      source_account: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      destination_account: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(20, 7),
        allowNull: false,
      },
      asset_code: {
        type: Sequelize.STRING(12),
        allowNull: false,
        defaultValue: 'XLM',
      },
      asset_issuer: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      memo: {
        type: Sequelize.STRING(28),
        allowNull: true,
      },
      required_signatures: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      collected_signatures_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      authorized_signers: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      unsigned_xdr: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      signed_xdr: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      stellar_tx_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'ready', 'submitted', 'expired', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      failure_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      expiry_job_id: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      threshold_met_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('multi_sig_payments', ['payment_id']);
    await queryInterface.addIndex('multi_sig_payments', ['status']);
    await queryInterface.addIndex('multi_sig_payments', ['expires_at']);
    await queryInterface.addIndex('multi_sig_payments', ['created_by']);

    // ─── multi_sig_signatures ────────────────────────────────────────────────
    await queryInterface.createTable('multi_sig_signatures', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      multi_sig_payment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'multi_sig_payments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      signer_public_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      signature: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      signed_envelope_xdr: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      signed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('multi_sig_signatures', ['multi_sig_payment_id']);
    await queryInterface.addIndex('multi_sig_signatures', ['signer_public_key']);
    await queryInterface.addIndex(
      'multi_sig_signatures',
      ['multi_sig_payment_id', 'signer_public_key'],
      {
        unique: true,
        name: 'unique_signature_per_payment_signer',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('multi_sig_signatures');
    await queryInterface.dropTable('multi_sig_payments');
    // Drop ENUM type (PostgreSQL requires explicit cleanup)
    await queryInterface.sequelize
      .query('DROP TYPE IF EXISTS "enum_multi_sig_payments_status";')
      .catch(() => {}); // silently ignore if using MySQL/SQLite
  },
};
