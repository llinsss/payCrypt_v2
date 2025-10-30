import { ethers } from "ethers";
import { base, lisk, u2u, flow } from "../chains.js";

export const getContract = (chain) => {
  const contracts = { base, lisk, u2u, flow };
  const contract = contracts[chain]?.contract();

  if (!contract) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  return contract;
};

export const createTagAddress = async (chain, tag) => {
  const contract = getContract(chain);

  const onchainAddress = await contract.getTagAddress(tag);
  if (onchainAddress && onchainAddress !== ethers.ZeroAddress) {
    return onchainAddress;
  }

  const tx = await contract.register(tag);
  const receipt = await tx.wait();

  if (receipt) {
    const newAddress = await contract.getTagAddress(tag);
    if (newAddress && newAddress !== ethers.ZeroAddress) {
      return newAddress;
    }
  }

  return null;
};

export const getTagAddress = async (chain, tag) => {
  const contract = getContract(chain);
  return await contract.getTagAddress(tag);
};

export const getTagBalance = async (chain, tag) => {
  const contract = getContract(chain);
  return await contract.getTagBalance(tag);
};
