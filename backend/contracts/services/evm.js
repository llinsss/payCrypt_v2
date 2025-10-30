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
    // console.error(`❌ ${chain.toUpperCase()} Failed to create tag:`, message);
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
    // console.error(
    //   `❌ ${chain.toUpperCase()} Failed to fetch tag address:`,
    //   error
    // );
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
    // console.error(
    //   `❌ ${chain.toUpperCase()} Failed to fetch tag balance:`,
    //   message
    // );
    return 0;
  }
};
