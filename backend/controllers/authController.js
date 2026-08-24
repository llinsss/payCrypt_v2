import { randomBytes } from "crypto";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import BankAccount from "../models/BankAccount.js";
import { balanceQueue } from "../queues/balance.js";
import { signToken } from "../config/jwt.js";
import ReferralService from "../services/ReferralService.js";

const sanitizeAuthUser = (user) => {
  if (!user) return user;
  user.password = undefined;
  user.two_factor_secret = undefined;
  user.two_factor_backup_codes = undefined;
  return user;
};

const generateBackupCodes = (count = 8) => {
  return Array.from({ length: count }, () =>
    randomBytes(4).toString("hex").toUpperCase()
  );
};

export const register = async (req, res) => {
  try {
    const { email, tag, address, password, role, referralCode } = req.body;

    // --- Check email ---
    const existingUserEmail = await User.findByEmail(email);
    if (existingUserEmail) {
      return res.status(400).json({ error: "User email already exists" });
    }

    // --- Check tag ---
    const existingUserTag = await User.findByTag(tag);
    if (existingUserTag) {
      return res.status(400).json({ error: "User tag already exists" });
    }

    // --- Validate referral code if provided ---
    let referredBy = null;
    if (referralCode) {
      referredBy = await ReferralService.validateReferralCode(referralCode);
      if (!referredBy) {
        console.warn(`Invalid referral code: ${referralCode}`);
      }
    }

    // --- Generate referral code ---
    const newReferralCode = await ReferralService.generateReferralCode();

    // --- Create user ---
    const photo = `https://api.dicebear.com/9.x/initials/svg?seed=${tag}`;
    const user = await User.create({
      email,
      tag,
      address,
      password,
      photo,
      role,
      referral_code: newReferralCode,
      referred_by: referredBy,
    });

    // --- Generate JWT ---
    const token = signToken({ userId: user.id });
    sanitizeAuthUser(user);

    // --- Create wallet + bank account immediately ---
    await Wallet.create({ user_id: user.id });
    await BankAccount.create({ user_id: user.id });
    // --- Queue balance creation (async) ---
    await balanceQueue.add("create-balances", {
      user_id: user.id,
      tag,
    });

    // --- Respond immediately ---
    res.status(201).json({
      message: "User registered successfully",
      token,
      user,
    });
  } catch (error) {
    console.error("❌ Registration failed:", error);
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = signToken({ userId: user.id });

    const last_login = new Date();
    const update_user = await User.update(user.id, {
      last_login: new Date(),
    });

    sanitizeAuthUser(user);

    res.json({
      message: "Login successful",
      token,
      user: { ...user, last_login },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const appName = process.env.APP_NAME || "PayCrypt";
    const secret = speakeasy.generateSecret({
      name: `${appName} (${user.email})`,
    });

    await User.setTwoFactorSecret(user.id, secret.base32);

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrCode, secret: secret.base32 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const enable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { token } = req.body;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.two_factor_secret) {
      return res.status(400).json({ error: "2FA setup required before enabling" });
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: "base32",
      token: String(token || "").trim(),
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const backupCodes = generateBackupCodes(8);
    await User.enableTwoFactor(user.id, backupCodes);

    res.json({ message: "2FA enabled", backupCodes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const verify2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const token = String(req.body?.token || "").trim().toUpperCase();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.two_factor_enabled || !user.two_factor_secret) {
      return res.status(400).json({ error: "2FA is not enabled for this account" });
    }

    const backupCodes = User.getBackupCodes(user);
    if (backupCodes.includes(token)) {
      const remainingCodes = backupCodes.filter((code) => code !== token);
      await User.updateBackupCodes(user.id, remainingCodes);
      return res.json({ verified: true, usedBackupCode: true });
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: "Invalid 2FA token" });
    }

    res.json({ verified: true, usedBackupCode: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const require2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.two_factor_enabled) {
      return next();
    }

    const token = String(req.body?.twoFactorToken || "").trim().toUpperCase();
    if (!token) {
      return res.status(403).json({ error: "2FA token required for this action" });
    }

    const backupCodes = User.getBackupCodes(user);
    if (backupCodes.includes(token)) {
      const remainingCodes = backupCodes.filter((code) => code !== token);
      await User.updateBackupCodes(user.id, remainingCodes);
      return next();
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      return res.status(403).json({ error: "Invalid 2FA token" });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "Google ID token required" });
    }

    const { OAuth2Client } = await import("google-auth-library");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const googleId = payload.sub;

    let user = await User.findByEmail(email);

    if (!user) {
      const defaultTag = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");
      user = await User.create({
        email,
        tag: defaultTag,
        password: "", // No password for Google users
        photo: payload.picture || `https://api.dicebear.com/9.x/initials/svg?seed=${defaultTag}`,
        role: "user",
        google_id: googleId,
      });

      await Wallet.create({ user_id: user.id });
      await BankAccount.create({ user_id: user.id });
      await balanceQueue.add("create-balances", {
        user_id: user.id,
        tag: defaultTag,
      });

      return res.status(201).json({
        message: "Account created via Google Sign-In",
        isNewUser: true,
        token: signToken({ userId: user.id }),
        user: sanitizeAuthUser(user),
      });
    }

    const token = signToken({ userId: user.id });
    await User.update(user.id, { last_login: new Date() });

    sanitizeAuthUser(user);

    res.status(200).json({
      message: "Login successful",
      isNewUser: false,
      token,
      user,
    });
  } catch (error) {
    console.error("Google login failed:", error);
    res.status(401).json({ error: "Invalid Google token or authentication failed" });
  }
};
