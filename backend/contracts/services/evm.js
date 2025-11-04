import { ethers } from "ethers";
import * as evm from "../evm.js";
import { formatChainAmount } from "../index.js";

export const createTagAddress = async (chain, tag) => {
  const evmContract = evm.getEvmChain(chain);
  const onchainAddress = await getTagAddress(chain, tag);
  if (onchainAddress) {
    return onchainAddress;
  }
  try {
    const tx = await evmContract.contract.register(tag);
    const receipt = await tx.wait();
    if (receipt) {
      const newAddress = await evmContract.contract.getTagAddress(tag);
      if (newAddress && newAddress !== ethers.ZeroAddress) {
        return newAddress;
      }
    }
    return null;
  } catch (error) {
    const message = error?.message || "";
    console.error(`❌ ${chain.toUpperCase()} Failed to create tag:`, message);
    return null;
  }
};

export const getTagAddress = async (chain, tag) => {
  const evmContract = evm.getEvmChain(chain);
  try {
    const result = await evmContract.contract.getTagAddress(tag);
    if (!result) return null;
    const walletAddress = result.toString();
    return walletAddress !== "0x0" ? walletAddress : null;
  } catch (error) {
    const message = error?.reason || error?.message || "";
    if (
      message.includes("Tag does not exist") ||
      message.includes("reverted") ||
      message.includes("CALL_EXCEPTION")
    ) {
      console.warn(`⚠️ Tag '${tag}' not found.`);
    }
    console.error(
      `❌ ${chain.toUpperCase()} Failed to fetch tag address:`,
      error
    );
    return null;
  }
};

export const getTagBalance = async (chain, tag) => {
  const evmContract = evm.getEvmChain(chain);
  try {
    const result = await evmContract.contract.getTagBalance(
      tag,
      ethers.ZeroAddress
    );
    if (!result) return 0;
    const balance = result;
    return formatChainAmount(chain, balance);
  } catch (error) {
    const message = error?.message || "";
    console.error(
      `❌ ${chain.toUpperCase()} Failed to fetch tag balance:`,
      message
    );
    return 0;
  }
};

export const sendToTag = async ({
  chain,
  sender_tag,
  receiver_tag,
  amount,
}) => {
  const evmContract = evm.getEvmChain(chain);
  const senderTag = sender_tag;
  const receiverTag = receiver_tag;
  const transferValue = ethers.parseUnits(amount.toString(), 18);
  const tokenAddress = ethers.ZeroAddress;
  try {
    const balance = await getTagBalance(chain, sender_tag);
    console.log(chain + " Balance For " + senderTag + ": " + balance);
    if (balance > amount) throw new Error("Insufficient wallet balance");

    const tx = await evmContract.contract.deposit(
      receiverTag,
      senderTag,
      tokenAddress,
      transferValue
    );
    const receipt = await tx.wait();
    if (receipt) {
      return receipt?.transactionHash;
    }
    return null;
  } catch (error) {
    const message = error?.message || "";
    console.error(`❌ ${chain.toUpperCase()} Failed to send to tag:`, message);
    return null;
  }
};

export const sendToWallet = async ({
  chain,
  sender_tag,
  receiver_address,
  amount,
}) => {
  const evmContract = evm.getEvmChain(chain);
  const senderTag = sender_tag;
  const receiverAddress = receiver_address;
  const transferValue = ethers.parseUnits(amount.toString(), 18);
  const tokenAddress = ethers.ZeroAddress;
  try {
    const balance = await getTagBalance(chain, sender_tag);
    console.log(chain + " Balance For " + senderTag + ": " + balance);
    if (balance > amount) throw new Error("Insufficient wallet balance");

    const tx = await evmContract.contract.withdrawFromWallet(
      receiverAddress,
      transferValue,
      senderTag,
      tokenAddress
    );
    const receipt = await tx.wait();
    if (receipt) {
      return receipt?.transactionHash;
    }
    return null;
  } catch (error) {
    const message = error?.message || "";
    console.error(`❌ ${chain.toUpperCase()} Failed to send to tag:`, message);
    return null;
  }
};
