import Wallet from "../models/Wallet.js";

export const createWallet = async (req, res) => {
  try {
    const walletData = {
      ...req.body,
      user_id: req.user.id,
    };

    const wallet = await Wallet.create(walletData);
    res.status(201).json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getWallets = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const wallets = await Wallet.getAll(Number.parseInt(limit), Number.parseInt(offset));
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const getWalletByUser = async (req, res) => {
  try {
    const { id } = req.user;
    const wallets = await Wallet.getByUser(id);
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getWalletById = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await Wallet.findById(id);

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    // Only allow wallet owner to view
    if (wallet.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await Wallet.findById(id);

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Only allow wallet owner to update
    if (wallet.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedWallet = await Wallet.update(id, req.body);
    res.json(updatedWallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await Wallet.findById(id);

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Only allow wallet owner to delete
    if (wallet.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Wallet.delete(id);
    res.json({ message: "Wallet deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
