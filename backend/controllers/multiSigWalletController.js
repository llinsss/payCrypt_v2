import MultiSigWallet from "../models/MultiSigWallet.js";
import MultiSigWalletService from "../services/MultiSigWalletService.js";

/**
 * Create a new multi-signature wallet
 */
export const createMultiSigWallet = async (req, res) => {
  try {
    const { id: owner_id } = req.user;
    const {
      required_signatures,
      total_signers,
      name,
      description,
      blockchain_network,
      daily_limit,
      transaction_limit,
    } = req.body;

    if (!required_signatures || !total_signers) {
      return res.status(400).json({
        error: "Missing required fields: required_signatures, total_signers",
      });
    }

    const wallet = await MultiSigWalletService.createWallet({
      owner_id,
      required_signatures: Number(required_signatures),
      total_signers: Number(total_signers),
      name: name || `Multi-Sig Wallet ${new Date().toLocaleDateString()}`,
      description,
      blockchain_network: blockchain_network || "ethereum",
      daily_limit,
      transaction_limit,
    });

    res.status(201).json({
      success: true,
      message: "Multi-sig wallet created successfully",
      data: wallet,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get multi-sig wallets for the current user
 */
export const getUserMultiSigWallets = async (req, res) => {
  try {
    const { id: owner_id } = req.user;

    const wallets = await MultiSigWallet.findByUserId(owner_id);

    res.json({
      success: true,
      data: wallets,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get a specific multi-sig wallet by ID
 */
export const getMultiSigWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await MultiSigWallet.findById(id);

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Check authorization
    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const coSigners = await MultiSigWallet.getCoSigners(id);

    res.json({
      success: true,
      data: {
        ...wallet,
        coSigners,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update multi-sig wallet configuration (e.g., thresholds, limits)
 */
export const updateMultiSigWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { required_signatures, daily_limit, transaction_limit, status } = req.body;

    const wallet = await MultiSigWallet.findById(id);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updates = {};
    if (required_signatures !== undefined) {
      if (required_signatures > wallet.total_signers) {
        return res.status(400).json({
          error: "Required signatures cannot exceed total signers",
        });
      }
      updates.required_signatures = required_signatures;
    }
    if (daily_limit !== undefined) updates.daily_limit = daily_limit;
    if (transaction_limit !== undefined) updates.transaction_limit = transaction_limit;
    if (status !== undefined) updates.status = status;

    const updated = await MultiSigWallet.update(id, updates);

    res.json({
      success: true,
      message: "Wallet updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add a co-signer to a multi-sig wallet
 */
export const addCoSigner = async (req, res) => {
  try {
    const { id: walletId } = req.params;
    const { address, email, name, user_id } = req.body;

    if (!address) {
      return res.status(400).json({ error: "Missing required field: address" });
    }

    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const coSigner = await MultiSigWalletService.addCoSigner(walletId, {
      address,
      email,
      name,
      user_id,
    });

    res.status(201).json({
      success: true,
      message: "Co-signer added successfully",
      data: coSigner,
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      error: error.message,
    });
  }
};

/**
 * Get all co-signers for a wallet
 */
export const getCoSigners = async (req, res) => {
  try {
    const { id: walletId } = req.params;

    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const coSigners = await MultiSigWallet.getCoSigners(walletId);

    res.json({
      success: true,
      data: coSigners,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove a co-signer from a multi-sig wallet
 */
export const removeCoSigner = async (req, res) => {
  try {
    const { id: walletId, coSignerId } = req.params;

    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await MultiSigWalletService.removeCoSigner(walletId, coSignerId);

    res.json({
      success: true,
      message: "Co-signer removed successfully",
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      error: error.message,
    });
  }
};

/**
 * Propose a transaction for approval
 */
export const proposeTransaction = async (req, res) => {
  try {
    const { id: walletId } = req.params;
    const { id: proposerId } = req.user;
    const { to_address, amount, token_symbol, data, description } = req.body;

    if (!to_address || !amount || !token_symbol) {
      return res.status(400).json({
        error: "Missing required fields: to_address, amount, token_symbol",
      });
    }

    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const proposal = await MultiSigWalletService.proposeTransaction(walletId, proposerId, {
      to_address,
      amount: Number(amount),
      token_symbol,
      data,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Transaction proposal created",
      data: proposal,
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      error: error.message,
    });
  }
};

/**
 * Get all proposals for a wallet
 */
export const getProposals = async (req, res) => {
  try {
    const { id: walletId } = req.params;
    const { status } = req.query;

    const wallet = await MultiSigWallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    let proposals = await MultiSigWallet.getProposalsByWallet(walletId);

    if (status) {
      proposals = proposals.filter(p => p.status === status);
    }

    res.json({
      success: true,
      data: proposals,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Approve a transaction proposal
 */
export const approveTransaction = async (req, res) => {
  try {
    const { id: walletId, proposalId } = req.params;
    const { id: approverId } = req.user;
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ error: "Missing required field: signature" });
    }

    const proposal = await MultiSigWallet.getProposal(proposalId);
    if (!proposal || proposal.wallet_id !== Number(walletId)) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    const updatedProposal = await MultiSigWalletService.approveTransaction(proposalId, approverId, {
      signature,
      decision: "approve",
    });

    res.json({
      success: true,
      message: "Transaction approved successfully",
      data: updatedProposal,
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      error: error.message,
    });
  }
};

/**
 * Reject a transaction proposal
 */
export const rejectTransaction = async (req, res) => {
  try {
    const { id: walletId, proposalId } = req.params;
    const { id: rejectorId } = req.user;
    const { reason } = req.body;

    const proposal = await MultiSigWallet.getProposal(proposalId);
    if (!proposal || proposal.wallet_id !== Number(walletId)) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    const updatedProposal = await MultiSigWalletService.rejectTransaction(proposalId, rejectorId, reason);

    res.json({
      success: true,
      message: "Transaction rejected successfully",
      data: updatedProposal,
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      error: error.message,
    });
  }
};

/**
 * Execute an approved transaction on-chain
 */
export const executeTransaction = async (req, res) => {
  try {
    const { id: walletId, proposalId } = req.params;
    const { tx_hash } = req.body;

    const proposal = await MultiSigWallet.getProposal(proposalId);
    if (!proposal || proposal.wallet_id !== Number(walletId)) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    const wallet = await MultiSigWallet.findById(walletId);
    if (wallet.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Only wallet owner can execute transactions" });
    }

    const updatedProposal = await MultiSigWalletService.executeTransaction(proposalId, tx_hash);

    res.json({
      success: true,
      message: "Transaction executed successfully",
      data: updatedProposal,
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      error: error.message,
    });
  }
};
