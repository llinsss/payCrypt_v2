import db from "../config/database.js";

const MultiSigWallet = {
  async create(walletData) {
    const [id] = await db("multi_sig_wallets").insert(walletData);
    return this.findById(id);
  },

  async findById(id) {
    return await db("multi_sig_wallets")
      .select(
        "multi_sig_wallets.*",
        "users.email",
        "users.tag",
      )
      .leftJoin("users", "multi_sig_wallets.owner_id", "users.id")
      .where("multi_sig_wallets.id", id)
      .first();
  },

  async findByUserId(userId) {
    return await db("multi_sig_wallets")
      .select("*")
      .where("owner_id", userId);
  },

  async findByContractAddress(contractAddress) {
    return await db("multi_sig_wallets")
      .select("*")
      .where("contract_address", contractAddress)
      .first();
  },

  async getAll(limit = 10, offset = 0) {
    return await db("multi_sig_wallets")
      .select("multi_sig_wallets.*", "users.email")
      .leftJoin("users", "multi_sig_wallets.owner_id", "users.id")
      .limit(limit)
      .offset(offset);
  },

  async update(id, updates) {
    await db("multi_sig_wallets").where("id", id).update(updates);
    return this.findById(id);
  },

  async delete(id) {
    return await db("multi_sig_wallets").where("id", id).delete();
  },

  async addCoSigner(walletId, coSignerData) {
    const [id] = await db("multi_sig_cosigners").insert({
      wallet_id: walletId,
      ...coSignerData,
    });
    return await db("multi_sig_cosigners").where("id", id).first();
  },

  async removeCoSigner(walletId, coSignerId) {
    return await db("multi_sig_cosigners")
      .where("wallet_id", walletId)
      .where("id", coSignerId)
      .delete();
  },

  async getCoSigners(walletId) {
    return await db("multi_sig_cosigners")
      .select("*")
      .where("wallet_id", walletId)
      .orderBy("created_at", "asc");
  },

  async getCoSigner(walletId, coSignerId) {
    return await db("multi_sig_cosigners")
      .select("*")
      .where("wallet_id", walletId)
      .where("id", coSignerId)
      .first();
  },

  async proposeTransaction(proposalData) {
    const [id] = await db("multi_sig_proposals").insert(proposalData);
    return await db("multi_sig_proposals").where("id", id).first();
  },

  async getProposal(proposalId) {
    return await db("multi_sig_proposals")
      .select("*")
      .where("id", proposalId)
      .first();
  },

  async getProposalsByWallet(walletId) {
    return await db("multi_sig_proposals")
      .select("*")
      .where("wallet_id", walletId)
      .orderBy("created_at", "desc");
  },

  async getPendingProposals(walletId) {
    return await db("multi_sig_proposals")
      .select("*")
      .where("wallet_id", walletId)
      .where("status", "pending")
      .orderBy("created_at", "desc");
  },

  async addApproval(approvalData) {
    const [id] = await db("multi_sig_approvals").insert(approvalData);
    return await db("multi_sig_approvals").where("id", id).first();
  },

  async getApprovals(proposalId) {
    return await db("multi_sig_approvals")
      .select("*")
      .where("proposal_id", proposalId);
  },

  async getApprovalCount(proposalId) {
    return await db("multi_sig_approvals")
      .where("proposal_id", proposalId)
      .count("* as count")
      .first();
  },

  async updateProposalStatus(proposalId, status, txHash = null) {
    const updateData = { status, updated_at: new Date() };
    if (txHash) updateData.tx_hash = txHash;
    if (status === "executed") updateData.executed_at = new Date();

    await db("multi_sig_proposals")
      .where("id", proposalId)
      .update(updateData);
    return this.getProposal(proposalId);
  },

  async getApprovalThreshold(walletId) {
    const wallet = await this.findById(walletId);
    return wallet ? wallet.required_signatures : null;
  },
};

export default MultiSigWallet;
