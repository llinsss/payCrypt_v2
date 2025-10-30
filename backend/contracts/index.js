import * as evm from "./services/evm.js";
import * as starknet from "./services/starknet.js";

export const chains = {
  STRK: "starknet",
  BASE: "base",
  LSK: "lisk",
  FLOW: "flow",
  U2U: "u2u",
};

export const register = async (chain, tag) => {
  if (chain === "starknet") {
    return await starknet.createTagAddress(tag);
  } else {
    return await evm.createTagAddress(chain, tag);
  }
};

export const tag_address = async (chain, tag) => {
  if (chain === "starknet") {
    return await starknet.getTagAddress(tag);
  } else {
    return await evm.getTagAddress(chain, tag);
  }
};

export const tag_balance = async (chain, tag) => {
  if (chain === "starknet") {
    return await starknet.getTagBalance(tag);
  } else {
    return await evm.getTagBalance(chain, tag);
  }
};
