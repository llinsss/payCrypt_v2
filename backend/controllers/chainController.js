import Chain from "../models/Chain.js";

/**
 * Chain controller
 *
 * Pagination is validated upstream by the validate(paginationSchema, "query")
 * middleware wired in chains.js routes — req.query.page and req.query.limit
 * are guaranteed to be safe integers when they reach these handlers.
 *
 * Body fields for create/update are validated and stripped by
 * validate(createChainSchema) / validate(updateChainSchema) middleware,
 * preventing mass-assignment of undocumented or sensitive columns.
 */

export const createChain = async (req, res) => {
  try {
    // req.body has already been validated and unknown fields stripped by
    // the validate(createChainSchema) middleware -- no mass assignment risk.
    const chainData = req.body;
    const chain = await Chain.create(chainData);
    res.status(201).json(chain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getChains = async (req, res) => {
  try {
    // page and limit are coerced to integers and bounded by the
    // validate(paginationSchema, "query") middleware before reaching here.
    const { page, limit } = req.query;
    const offset = (page - 1) * limit;

    const chains = await Chain.getAll(limit, offset);
    res.json(chains);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getChainById = async (req, res) => {
  try {
    const { id } = req.params;
    const chain = await Chain.findById(id);

    if (!chain) {
      return res.status(404).json({ error: "Chain not found" });
    }

    res.json(chain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateChain = async (req, res) => {
  try {
    const { id } = req.params;
    const chain = await Chain.findById(id);

    if (!chain) {
      return res.status(404).json({ error: "Chain not found" });
    }

    // req.body has already been validated and unknown fields stripped by
    // the validate(updateChainSchema) middleware -- no mass assignment risk.
    const updatedChain = await Chain.update(id, req.body);
    res.json(updatedChain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteChain = async (req, res) => {
  try {
    const { id } = req.params;
    const chain = await Chain.findById(id);

    if (!chain) {
      return res.status(404).json({ error: "Chain not found" });
    }

    await Chain.delete(id);
    res.json({ message: "Chain deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};