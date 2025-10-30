import { ethers } from "ethers";
import * as evm from "../evm.js";

export const createTagAddress = async (chain, tag) => {
  const evmContract = evm.getEvmChain(chain);
  // const onchainAddress = await evmContract.contract.getTagAddress(tag);
  // if (onchainAddress && onchainAddress !== ethers.ZeroAddress) {
  //   return onchainAddress;
  // }
  const tx = await evmContract.contract.register(tag);
  const receipt = await tx.wait();
  if (receipt) {
    const newAddress = await evmContract.contract.getTagAddress(tag);
    if (newAddress && newAddress !== ethers.ZeroAddress) {
      return newAddress;
    }
  }

  return null;
};

export const getTagAddress = async (chain, tag) => {
  const evmContract = evm.getEvmChain(chain);
  return await evmContract.contract.getTagAddress(tag);
};

export const getTagBalance = async (chain, tag) => {
  const evmContract = evm.getEvmChain(chain);
  return await evmContract.contract.getTagBalance(tag);
};
