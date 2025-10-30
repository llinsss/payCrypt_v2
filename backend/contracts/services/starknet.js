import { shortString } from "starknet";
import * as starknet from "../starknet.js";

export const createTagAddress = async (tag) => {
  const starknetContract = starknet.getStarknetChain();
  const feltTag = shortString.encodeShortString(tag);
  const call = await starknetContract.contract.populate("register_tag", [tag]);
  const tx = await starknetContract.safeExecute(call);
  await starknetContract.provider.waitForTransaction(tx.transaction_hash);
  const newTag = await starknetContract.contract.get_tag_wallet_address(tag);
  return newTag && newTag !== "0x0" ? `0x${BigInt(newTag).toString(16)}` : null;
};

export const getTagAddress = async (tag) => {
  const starknetContract = starknet.getStarknetChain();
  const feltTag = shortString.encodeShortString(tag);
  return await starknetContract.contract.get_tag_wallet_address(tag);
};

export const getTagBalance = async (tag) => {
  const starknetContract = starknet.getStarknetChain();
  const feltTag = shortString.encodeShortString(tag);
  return await starknetContract.contract.get_tag_wallet_balance(tag, starknetContract.config.tokenAddress);
};
