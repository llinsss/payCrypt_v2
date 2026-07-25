import Kyc from "../models/Kyc.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const buildKycStatusPayload = (kycRecord) => ({
  id: kycRecord?.id ?? null,
  status: kycRecord?.status ?? "none",
  kyc_status: kycRecord?.status ?? "none",
  rejectionReason: kycRecord?.rejection_reason || null,
  updatedAt: kycRecord?.updated_at || kycRecord?.created_at || null,
});

export const createKyc = async (req, res) => {
  try {
    const kycData = {
      ...req.body,
      user_id: req.user.id,
      status: "pending",
    };

    const kyc = await Kyc.create(kycData);
    await User.update(req.user.id, { kyc_status: "pending" });
    res.status(201).json(kyc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const approveKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const kyc = await Kyc.findById(id);
    if (!kyc) return res.status(404).json({ error: "KYC not found" });

    await Kyc.update(id, { status: "approved", rejection_reason: null });
    await User.update(kyc.user_id, { is_verified: 1, kyc_status: "verified" });
    await Notification.create({
      user_id: kyc.user_id,
      title: "KYC approved",
      body: "Your identity verification has been approved. You can now continue using Tagged.",
      type: "security",
      channel: "push",
    });
    res.json({ message: "KYC approved" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectKyc = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const kyc = await Kyc.findById(id);
    if (!kyc) return res.status(404).json({ error: "KYC not found" });

    await Kyc.update(id, {
      status: "rejected",
      rejection_reason: reason || null,
    });
    await User.update(kyc.user_id, { is_verified: 0, kyc_status: "rejected" });
    await Notification.create({
      user_id: kyc.user_id,
      title: "KYC rejected",
      body: reason
        ? `Your identity verification was rejected: ${reason}`
        : "Your identity verification was rejected. Please review the requirements and resubmit your documents.",
      type: "security",
      channel: "push",
    });
    res.json({ message: "KYC rejected" });
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
      Number.parseInt(offset),
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
    if (!kycs || kycs.length === 0) {
      return res.status(400).json({ error: "No Kyc yet" });
    }

    res.json(kycs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getKycStatus = async (req, res) => {
  try {
    const { id } = req.user;
    const kycs = await Kyc.getByUser(id);
    const latestKyc = kycs?.[0] || null;

    if (!latestKyc) {
      return res.status(200).json({
        status: "none",
        kyc_status: "none",
        rejectionReason: null,
        updatedAt: null,
      });
    }

    res.json(buildKycStatusPayload(latestKyc));
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
