import { parseUnits, formatUnits } from "ethers";

export const from18Decimals = (value) => {
  return formatUnits(value, 18);
};

export const to18Decimals = (value) => {
  return parseUnits(value, 18).toString();
};
