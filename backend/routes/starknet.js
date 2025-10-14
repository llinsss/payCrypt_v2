import express from "express";
import { getContract, utils } from "../starknet-contract.js";
const router = express.Router();

// ✅ Read example (balance_of)
router.get("/balance/:address", async (req, res) => {
  try {
    const { contract } = getContract();
    const address = req.params.address;

    if (!utils.isValidStarkNetAddress(address)) {
      return res.status(400).json({ error: "Invalid StarkNet address" });
    }

    const result = await contract.call("balance_of", [address]);
    const balance = utils.uint256ToBigInt(result.balance).toString();

    res.json({ address, balance });
  } catch (err) {
    console.error("❌ Error reading balance:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Write example (transfer)
router.post("/transfer", async (req, res) => {
  try {
    const { contract, account } = getContract();
    const { to, amount } = req.body;

    if (!account) {
      throw new Error("Account not configured with private key");
    }

    if (!utils.isValidStarkNetAddress(to)) {
      return res.status(400).json({ error: "Invalid recipient address" });
    }

    const amountUint = utils.bigIntToUint256(amount);
    const invocation = await contract
      .connect(account)
      .invoke("transfer", [to, amountUint]);

    res.json({
      message: "Transfer submitted",
      txHash: invocation.transaction_hash,
    });
  } catch (err) {
    console.error("❌ Transfer failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
