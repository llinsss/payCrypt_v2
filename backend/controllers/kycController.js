import Kyc from "../models/Kyc.js";
import User from "../models/User.js";

export const createKyc = async (req, res) => {
  try {
    const kycData = {
      ...req.body,
      user_id: req.user.id,
      status: 'pending',
    };

    const kyc = await Kyc.create(kycData);
    await User.update(req.user.id, { kyc_status: 'pending' });
    res.status(201).json(kyc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const approveKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const kyc = await Kyc.findById(id);
    if (!kyc) return res.status(404).json({ error: 'KYC not found' });

    await Kyc.update(id, { status: 'approved' });
    await User.update(kyc.user_id, { is_verified: 1, kyc_status: 'verified' });
    res.json({ message: 'KYC approved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const kyc = await Kyc.findById(id);
    if (!kyc) return res.status(404).json({ error: 'KYC not found' });

    await Kyc.update(id, { status: 'rejected', rejection_reason: reason || null });
    await User.update(kyc.user_id, { is_verified: 0, kyc_status: 'rejected' });
    res.json({ message: 'KYC rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getKycs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const kycs = await Kyc.getAll(
      Number.parseInt(limit),
      Number.parseInt(offset)
    );
    res.json(kycs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getKycByUser = async (req, res) => {
  try {
    const { id } = req.user;
    const kycs = await Kyc.getByUser(id);
    if (kyc.length === 0) {
      return res.status(400).json({ error: "No Kyc yet" });
    }
    res.json(kycs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getKycById = async (req, res) => {
  try {
    const { id } = req.params;
    const kyc = await Kyc.findById(id);

    if (!kyc) {
      return res.status(400).json({ error: "Kyc not found" });
    }
    // Only allow kyc owner to view
    if (kyc.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(kyc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const kyc = await Kyc.findById(id);

    if (!kyc) {
      return res.status(400).json({ error: "Kyc not found" });
    }

    // Only allow kyc owner to update
    if (kyc.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedKyc = await Kyc.update(id, req.body);
    res.json(updatedKyc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const kyc = await Kyc.findById(id);

    if (!kyc) {
      return res.status(400).json({ error: "Kyc not found" });
    }

    // Only allow kyc owner to delete
    if (kyc.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Kyc.delete(id);
    res.json({ message: "Kyc deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
