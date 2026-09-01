import Token from "../models/Token.js";

/**
 * Token controller
 *
 * Pagination is validated upstream by the validate(paginationSchema, "query")
 * middleware wired in tokens.js routes -- req.query.page and req.query.limit
 * are guaranteed to be safe integers when they reach these handlers.
 *
 * Body fields for create/update are validated and stripped by
 * validate(createTokenSchema) / validate(updateTokenSchema) middleware,
 * preventing mass-assignment of undocumented or sensitive columns.
 */

export const createToken = async (req, res) => {
  try {
    // req.body has already been validated and unknown fields stripped by
    // the validate(createTokenSchema) middleware -- no mass assignment risk.
    const tokenData = req.body;
    const token = await Token.create(tokenData);
    res.status(201).json(token);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTokens = async (req, res) => {
  try {
    // page and limit are coerced to integers and bounded by the
    // validate(paginationSchema, "query") middleware before reaching here.
    const { page, limit } = req.query;
    const offset = (page - 1) * limit;

    const tokens = await Token.getAll(limit, offset);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTokenById = async (req, res) => {
  try {
    const { id } = req.params;
    const token = await Token.findById(id);

    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    res.json(token);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateToken = async (req, res) => {
  try {
    const { id } = req.params;
    const token = await Token.findById(id);

    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    // req.body has already been validated and unknown fields stripped by
    // the validate(updateTokenSchema) middleware -- no mass assignment risk.
    const updatedToken = await Token.update(id, req.body);
    res.json(updatedToken);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteToken = async (req, res) => {
  try {
    const { id } = req.params;
    const token = await Token.findById(id);

    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    await Token.delete(id);
    res.json({ message: "Token deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};