import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const register = async (req, res) => {
  try {
    const { email, tag, address, password } = req.body;
    // Normalize inputs
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedTag = (tag || "").trim().toLowerCase();

    // Check if user email already exists
    const existingUserEmail = await User.findByEmail(normalizedEmail);
    if (existingUserEmail) {
      return res.status(409).json({ error: "User email already exists" });
    }

    // Check if user tag already exists
    const existingUserTag = await User.findByTag(normalizedTag);
    if (existingUserTag) {
      return res.status(409).json({ error: "User tag already exists" });
    }
    // Create new user
    const user = await User.create({ email: normalizedEmail, tag: normalizedTag, address, password });

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        tag: user.tag,
        email: user.email,
        photo: user.photo,
        kyc_status: user.kyc_status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { entity, password } = req.body;

    // Normalize login entity: allow email or @tag, trim, and lowercase
    const rawEntity = (entity || "").trim();
    const stripped = rawEntity.startsWith("@") ? rawEntity.slice(1) : rawEntity;
    const isEmailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(stripped);
    const lookupEntity = isEmailLike ? stripped.toLowerCase() : stripped.toLowerCase();

    // Find user by entity
    const user = await User.findByEntity(lookupEntity);
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        tag: user.tag,
        email: user.email,
        photo: user.photo,
        kyc_status: user.kyc_status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user.id,
        tag: user.tag,
        email: user.email,
        photo: user.photo,
        kyc_status: user.kyc_status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
