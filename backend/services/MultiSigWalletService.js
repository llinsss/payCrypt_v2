import MultiSigWallet from "../models/MultiSigWallet.js";
import { Notification } from "../models/index.js";
import { notificationQueue } from "../queues/notifications.js";

class MultiSigWalletService {
  /**
   * Creates a new multi-signature wallet
   * @param {Object} walletData - Wallet creation data
   * @returns {Promise<Object>} Created wallet
   */
  async createWallet(walletData) {
    if (!walletData.owner_id || !walletData.required_signatures || !walletData.total_signers) {
      throw new Error("Missing required fields: owner_id, required_signatures, total_signers");
    }

    if (walletData.required_signatures > walletData.total_signers) {
      throw new Error("Required signatures cannot exceed total signers");
    }

    const wallet = await MultiSigWallet.create({
      owner_id: walletData.owner_id,
      contract_address: walletData.contract_address || null,
      blockchain_network: walletData.blockchain_network || "ethereum",
      required_signatures: walletData.required_signatures,
      total_signers: walletData.total_signers,
      daily_limit: walletData.daily_limit || null,
      transaction_limit: walletData.transaction_limit || null,
      name: walletData.name || `Multi-Sig Wallet ${new Date().toISOString()}`,
      description: walletData.description || null,
      status: "active",
    });

    return wallet;
  }

  /**
   * Adds a co-signer to a multi-sig wallet
   * @param {number} walletId - Wallet ID
   * @param {Object} coSignerData - Co-signer information
   * @returns {Promise<Object>} Added co-signer
   */
  async addCoSigner(walletId, coSignerData) {
    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Check if address already exists for this wallet
    const existingCoSigners = await MultiSigWallet.getCoSigners(walletId);
    if (existingCoSigners.some(cs => cs.address === coSignerData.address)) {
      throw new Error("This address is already a co-signer for this wallet");
    }

    const coSigner = await MultiSigWallet.addCoSigner(walletId, {
      user_id: coSignerData.user_id || null,
      address: coSignerData.address,
      name: coSignerData.name || null,
      email: coSignerData.email || null,
      status: "pending",
    });

    // Send notification to co-signer
    await this.notifyCoSigner(
      coSigner.user_id,
      walletId,
      "Co-signer invited",
      `You have been invited to be a co-signer for wallet: ${wallet.name || walletId}`
    );

    return coSigner;
  }

  /**
   * Removes a co-signer from a multi-sig wallet
   * @param {number} walletId - Wallet ID
   * @param {number} coSignerId - Co-signer ID
   * @returns {Promise<number>} Number of deleted records
   */
  async removeCoSigner(walletId, coSignerId) {
    const coSigner = await MultiSigWallet.getCoSigner(walletId, coSignerId);
    if (!coSigner) {
      throw new Error("Co-signer not found for this wallet");
    }

    await MultiSigWallet.removeCoSigner(walletId, coSignerId);

    // Notify removed co-signer
    if (coSigner.user_id) {
      await this.notifyCoSigner(
        coSigner.user_id,
        walletId,
        "Removed from multi-sig wallet",
        "You have been removed as a co-signer"
      );
    }

    return 1;
  }

  /**
   * Proposes a transaction for approval
   * @param {number} walletId - Wallet ID
   * @param {number} proposerId - User ID of proposer
   * @param {Object} transactionData - Transaction details
   * @returns {Promise<Object>} Created proposal
   */
  async proposeTransaction(walletId, proposerId, transactionData) {
    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.status !== "active") {
      throw new Error("Wallet is not active");
    }

    if (!transactionData.to_address || !transactionData.amount || !transactionData.token_symbol) {
      throw new Error("Missing required fields: to_address, amount, token_symbol");
    }

    const proposal = await MultiSigWallet.proposeTransaction({
      wallet_id: walletId,
      proposer_id: proposerId,
      to_address: transactionData.to_address,
      amount: transactionData.amount,
      token_symbol: transactionData.token_symbol,
      data: transactionData.data || null,
      description: transactionData.description || null,
      status: "pending",
      approval_count: 0,
      expires_at: transactionData.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Notify all co-signers
    const coSigners = await MultiSigWallet.getCoSigners(walletId);
    for (const coSigner of coSigners) {
      if (coSigner.user_id && coSigner.user_id !== proposerId) {
        await this.notifyCoSigner(
          coSigner.user_id,
          walletId,
          "Transaction approval requested",
          `A new transaction has been proposed for approval: ${transactionData.amount} ${transactionData.token_symbol} to ${transactionData.to_address}`
        );
      }
    }

    return proposal;
  }

  /**
   * Approves a transaction proposal
   * @param {number} proposalId - Proposal ID
   * @param {number} approverId - User ID of approver
   * @param {Object} approvalData - Approval signature and decision
   * @returns {Promise<Object>} Updated proposal
   */
  async approveTransaction(proposalId, approverId, approvalData) {
    const proposal = await MultiSigWallet.getProposal(proposalId);
    if (!proposal) {
      throw new Error("Proposal not found");
    }

    if (proposal.status !== "pending") {
      throw new Error("Proposal is not pending approval");
    }

    // Add approval
    const approval = await MultiSigWallet.addApproval({
      proposal_id: proposalId,
      approver_id: approverId,
      signature: approvalData.signature,
      decision: approvalData.decision || "approve",
      reason: approvalData.reason || null,
    });

    // Get updated approval count
    const approvalCount = await MultiSigWallet.getApprovalCount(proposalId);
    const countValue = approvalCount.count || 0;

    // Update proposal approval count
    await MultiSigWallet.updateProposalStatus(
      proposalId,
      countValue >= proposal.required_signatures ? "approved" : "pending"
    );

    // If approved, notify wallet owner for execution
    if (countValue >= proposal.required_signatures) {
      await this.notifyWalletOwner(
        proposal.wallet_id,
        "Transaction approved",
        `Transaction ${proposalId} has received all required approvals and is ready for execution`
      );
    }

    return await MultiSigWallet.getProposal(proposalId);
  }

  /**
   * Rejects a transaction proposal
   * @param {number} proposalId - Proposal ID
   * @param {number} rejectorId - User ID of rejector
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Updated proposal
   */
  async rejectTransaction(proposalId, rejectorId, reason = "") {
    const proposal = await MultiSigWallet.getProposal(proposalId);
    if (!proposal) {
      throw new Error("Proposal not found");
    }

    if (proposal.status !== "pending") {
      throw new Error("Proposal is not pending approval");
    }

    // Add rejection approval
    await MultiSigWallet.addApproval({
      proposal_id: proposalId,
      approver_id: rejectorId,
      signature: "", // No signature for rejection
      decision: "reject",
      reason: reason || null,
    });

    // Update proposal status to rejected
    await MultiSigWallet.updateProposalStatus(proposalId, "rejected");

    // Notify wallet owner
    await this.notifyWalletOwner(
      proposal.wallet_id,
      "Transaction rejected",
      `Transaction ${proposalId} has been rejected. Reason: ${reason}`
    );

    return await MultiSigWallet.getProposal(proposalId);
  }

  /**
   * Executes an approved transaction
   * @param {number} proposalId - Proposal ID
   * @param {string} txHash - On-chain transaction hash
   * @returns {Promise<Object>} Updated proposal
   */
  async executeTransaction(proposalId, txHash = null) {
    const proposal = await MultiSigWallet.getProposal(proposalId);
    if (!proposal) {
      throw new Error("Proposal not found");
    }

    if (proposal.status !== "approved") {
      throw new Error("Proposal is not approved for execution");
    }

    // Update proposal status to executed
    const updatedProposal = await MultiSigWallet.updateProposalStatus(proposalId, "executed", txHash);

    // Notify all stakeholders
    await this.notifyWalletOwner(
      proposal.wallet_id,
      "Transaction executed",
      `Transaction ${proposalId} has been successfully executed on-chain. Hash: ${txHash || "pending"}`
    );

    return updatedProposal;
  }

  /**
   * Helper method to send notifications to co-signers
   * @private
   */
  async notifyCoSigner(userId, walletId, title, message) {
    if (!userId) return;

    try {
      await notificationQueue.add("send_notification", {
        user_id: userId,
        title,
        message,
        type: "multi_sig_event",
        wallet_id: walletId,
      });
    } catch (error) {
      console.error("Failed to queue notification:", error);
    }
  }

  /**
   * Helper method to notify wallet owner
   * @private
   */
  async notifyWalletOwner(walletId, title, message) {
    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) return;

    await this.notifyCoSigner(wallet.owner_id, walletId, title, message);
  }
}

export default new MultiSigWalletService();
