import { Account, Contract, RpcProvider } from "starknet";
import { mainABI } from "../abis/StarknetContractABI.js";

/**
 * Unified Starknet chain configuration.
 */
export const getStarknetChain = () => {
  const config = {
    network: process.env.STARKNET_NETWORK || "sepolia",
    nodeUrl: process.env.STARKNET_RPC_URL,
    contractAddress: process.env.STARKNET_CONTRACT_ADDRESS,
    accountAddress: process.env.STARKNET_ACCOUNT_ADDRESS,
    privateKey: process.env.STARKNET_PRIVATE_KEY,
    contractABI: mainABI,
    tokenAddress: process.env.STARKNET_TOKEN_ADDRESS
  };

  if (!config.nodeUrl || !config.contractAddress) {
    throw new Error("❌ Missing Starknet environment variables");
  }

  const provider = new RpcProvider({
    nodeUrl: config.nodeUrl,
    blockIdentifier: "latest",
  });

  let account = null;
  if (config.accountAddress && config.privateKey) {
    account = new Account(provider, config.accountAddress, config.privateKey);
  }

  const contract = new Contract(
    config.contractABI,
    config.contractAddress,
    account ?? provider
  );

  const safeExecute = async (call, options) => {
    const calls = Array.isArray(call) ? call : [call];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resourceBounds = {
          l1_gas: {
            max_amount: "0x100000",
            max_price_per_unit: "0x174876e800",
          },
          l2_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
          l1_data_gas: {
            max_amount: "0x100000",
            max_price_per_unit: "0x174876e800",
          },
        };

        const feeEstimate = await account.estimateInvokeFee(calls, {
          blockIdentifier: "latest",
          version: "0x3",
          resourceBounds,
          skipValidate: true,
        });

        const rawFee = feeEstimate.overall_fee ?? feeEstimate.suggestedMaxFee;
        if (!rawFee) {
          throw new Error(
            "Fee estimation failed: no overall_fee or suggestedMaxFee"
          );
        }

        const suggestedMaxFee = BigInt(rawFee);
        const maxFee = options?.maxFee || (suggestedMaxFee * 12n) / 10n;

        console.log(`Fee: ${suggestedMaxFee} → maxFee: ${maxFee}`);

        const tx = await account.execute(calls, undefined, {
          maxFee,
          version: "0x3",
          resourceBounds,
        });

        return tx;
      } catch (error) {
        console.warn(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt === 3) throw error;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };

  return {
    provider,
    account,
    contract,
    config,
    safeExecute,
  };
};
