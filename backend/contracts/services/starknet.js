import { shortString } from "starknet";
import * as starknet from "../starknet.js";
import { formatChainAmount } from "../index.js";
import { to18Decimals } from "../../utils/amount.js";

export const createTagAddress = async (tag) => {
  const starknetContract = starknet.getStarknetChain();
  const onchainAddress = await getTagAddress(tag);
  if (onchainAddress) {
    return onchainAddress;
  }
  try {
    const feltTag = shortString.encodeShortString(tag);
    const call = await starknetContract.contract.populate("register_tag", [
      feltTag,
    ]);
    const tx = await starknetContract.safeExecute(call);
    await starknetContract.provider.waitForTransaction(tx.transaction_hash);
    const txHash = tx.transaction_hash;
    if (txHash) {
      const newTag = await starknetContract.contract.get_tag_wallet_address(
        feltTag
      );
      if (!newTag) return null;
      const walletAddress =
        typeof newTag === "bigint"
          ? `0x${newTag.toString(16)}`
          : newTag.toString().startsWith("0x")
          ? newTag
          : `0x${BigInt(newTag).toString(16)}`;
      return walletAddress !== "0x0" ? walletAddress : null;
    }
    return null;
  } catch (error) {
    const message = error?.message || "";
    // console.error("❌ STARKNET - Failed to create tag:", message);
    return null;
  }
};

export const getTagAddress = async (tag) => {
  const starknetContract = starknet.getStarknetChain();
  const feltTag = shortString.encodeShortString(tag);
  try {
    const result = await starknetContract.contract.get_tag_wallet_address(
      feltTag
    );

    if (!result) return null;

    const walletAddress =
      typeof result === "bigint"
        ? `0x${result.toString(16)}`
        : result.toString().startsWith("0x")
        ? result
        : `0x${BigInt(result).toString(16)}`;

    return walletAddress !== "0x0" ? walletAddress : null;
  } catch (error) {
    const message = error?.message || "";
    if (message.includes("User profile does not exist")) {
      console.warn(`⚠️ STARKNET - Tag '${tag}' not found.`);
      return null;
    }
    // console.error("❌ STARKNET - Failed to fetch tag address:", message);
    return null;
  }
};

export const getTagBalance = async (tag) => {
  const starknetContract = starknet.getStarknetChain();
  const feltTag = shortString.encodeShortString(tag);
  try {
    const result = await starknetContract.contract.get_tag_wallet_balance(
      feltTag,
      starknetContract.config.tokenAddress
    );
    if (!result) return 0;
    const balance = result.toString();
    return formatChainAmount("starknet", balance);
  } catch (error) {
    const message = error?.message || "";
    // console.error("❌ STARKNET - Failed to fetch tag balance:", message);
    return 0;
  }
};

export const sendToTag = async ({
  chain,
  sender_tag,
  receiver_tag,
  amount,
}) => {
  const starknetContract = starknet.getStarknetChain();
  const receiverTag = shortString.encodeShortString(receiver_tag);
  const senderTag = shortString.encodeShortString(sender_tag);
  const transferValue = to18Decimals(amount.toString());
  const tokenAddress = starknetContract.config.tokenAddress;
  try {
    const balance = await getTagBalance(sender_tag);
    if (balance < amount) throw new Error("Insufficient wallet balance");

    const call = await starknetContract.contract.populate("deposit_to_tag", [
      receiverTag,
      senderTag,
      transferValue,
      tokenAddress,
    ]);
    const tx = await starknetContract.safeExecute(call);
    await starknetContract.provider.waitForTransaction(tx.transaction_hash);
    const txHash = tx.transaction_hash;
    if (txHash) {
      return txHash;
    }
    return null;
  } catch (error) {
    const message = error?.message || "";
    // console.error("❌ STARKNET - Failed to send to tag:", message);
    return null;
  }
};

export const sendToWallet = async ({
  chain,
  sender_tag,
  receiver_address,
  amount,
}) => {
  const starknetContract = starknet.getStarknetChain();
  const receiverAddress = receiver_address;
  const senderTag = shortString.encodeShortString(sender_tag);
  const transferValue = to18Decimals(amount.toString());
  const tokenAddress = starknetContract.config.tokenAddress;
  try {
    const balance = await getTagBalance(sender_tag);
    if (balance < amount) throw new Error("Insufficient wallet balance");

    const call = await starknetContract.contract.populate(
      "withdraw_from_wallet",
      [tokenAddress, senderTag, receiverAddress, transferValue]
    );
    const tx = await starknetContract.safeExecute(call);
    await starknetContract.provider.waitForTransaction(tx.transaction_hash);
    const txHash = tx.transaction_hash;
    if (txHash) {
      return txHash;
    }
    return null;
  } catch (error) {
    const message = error?.message || "";
    // console.error("❌ STARKNET - Failed to send to tag:", message);
    return null;
  }
};
