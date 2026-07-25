import { ethers } from "ethers";
import * as evm from "../evm.js";
import { formatChainAmount } from "../index.js";

/**
 * Flow blockchain service.
 *
 * Flow EVM is EVM-compatible, so we reuse the ethers-based EVM contract
 * client. The FLOW_ env vars (FLOW_RPC_URL, FLOW_CONTRACT_ADDRESS,
 * FLOW_ACCOUNT_ADDRESS, FLOW_PRIVATE_KEY) configure the connection.
 *
 * Flow EVM address format: 0x + 16 hex chars (8 bytes).
 */

const CHAIN = "flow";

/**
 * Validate a Flow EVM address.
 * Flow EVM uses 8-byte (16 hex char) addresses, unlike standard EVM 20-byte.
 * @param {string} address
 * @returns {boolean}
 */
export const isValidFlowAddress = (address) =>
  typeof address === "string" && /^0x[a-fA-F0-9]{16}$/.test(address);

export const createTagAddress = async (tag) => {
  const flowContract = evm.getEvmChain(CHAIN);
  const existing = await getTagAddress(tag);
  if (existing) return existing;

  try {
    const tx = await flowContract.contract.register(tag);
    const receipt = await tx.wait();
    if (receipt) {
      const newAddress = await flowContract.contract.getTagAddress(tag);
      if (newAddress && newAddress !== ethers.ZeroAddress) {
        return newAddress;
      }
    }
    return null;
  } catch (error) {
    console.error("❌ FLOW Failed to create tag:", error?.message);
    return null;
  }
};

export const getTagAddress = async (tag) => {
  const flowContract = evm.getEvmChain(CHAIN);
  try {
    const result = await flowContract.contract.getTagAddress(tag);
    if (!result) return null;
    const addr = result.toString();
    return addr !== "0x0" ? addr : null;
  } catch (error) {
    const message = error?.reason || error?.message || "";
    if (
      message.includes("Tag does not exist") ||
      message.includes("reverted") ||
      message.includes("CALL_EXCEPTION")
    ) {
      console.warn(`⚠️ FLOW Tag '${tag}' not found.`);
    } else {
      console.error("❌ FLOW Failed to fetch tag address:", message);
    }
    return null;
  }
};

export const getTagBalance = async (tag) => {
  const flowContract = evm.getEvmChain(CHAIN);
  try {
    const result = await flowContract.contract.getTagBalance(
      tag,
      ethers.ZeroAddress
    );
    if (!result) return 0;
    return formatChainAmount(CHAIN, result);
  } catch (error) {
    console.error("❌ FLOW Failed to fetch tag balance:", error?.message);
    return 0;
  }
};

export const sendToTag = async ({ sender_tag, receiver_tag, amount }) => {
  const flowContract = evm.getEvmChain(CHAIN);
  const transferValue = ethers.parseUnits(amount.toString(), 8); // Flow uses 8 decimals
  const tokenAddress = ethers.ZeroAddress;
  try {
    const balance = await getTagBalance(sender_tag);
    if (balance < amount) throw new Error("Insufficient wallet balance");

    const tx = await flowContract.contract.deposit(
      receiver_tag,
      sender_tag,
      tokenAddress,
      transferValue
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? null;
  } catch (error) {
    console.error("❌ FLOW Failed to send to tag:", error?.message);
    return null;
  }
};

export const sendToWallet = async ({
  sender_tag,
  receiver_address,
  amount,
}) => {
  if (!isValidFlowAddress(receiver_address)) {
    throw new Error(
      `Invalid Flow address: ${receiver_address}. Must be 0x followed by 16 hex characters.`
    );
  }

  const flowContract = evm.getEvmChain(CHAIN);
  const transferValue = ethers.parseUnits(amount.toString(), 8); // Flow uses 8 decimals
  const tokenAddress = ethers.ZeroAddress;
  try {
    const balance = await getTagBalance(sender_tag);
    if (balance < amount) throw new Error("Insufficient wallet balance");

    const tx = await flowContract.contract.withdrawFromWallet(
      receiver_address,
      transferValue,
      sender_tag,
      tokenAddress
    );
    const receipt = await tx.wait();
    return receipt?.transactionHash ?? null;
  } catch (error) {
    console.error("❌ FLOW Failed to send to wallet:", error?.message);
    return null;
  }
};
