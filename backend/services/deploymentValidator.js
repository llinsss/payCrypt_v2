import { getEvmChain } from "../contracts/evm.js";
import { getEvmProvider } from "../contracts/index.js";

const EVM_CHAINS = ["base", "lisk", "flow", "u2u"];

async function checkEvmChain(chain) {
  try {
    const evmChain = getEvmChain(chain);
    const { provider, config } = evmChain;

    const status = {
      chain: chain,
      configuredAddress: config.contractAddress || null,
      nodeUrl: config.nodeUrl || null,
      reachable: false,
      codePresent: false,
      chainId: null,
      error: null,
    };

    if (!provider || !config.contractAddress) {
      status.error = "missing provider or contract address";
      return status;
    }

    try {
      const network = await provider.getNetwork();
      status.chainId = network.chainId;
    } catch (err) {
      status.error = `provider network error: ${err.message}`;
      return status;
    }

    try {
      const code = await provider.getCode(config.contractAddress);
      status.reachable = true;
      // ethers returns '0x' for empty code
      status.codePresent = code && code !== "0x" && code !== "0x0";
    } catch (err) {
      status.error = `getCode error: ${err.message}`;
    }

    return status;
  } catch (err) {
    return {
      chain,
      configuredAddress: null,
      nodeUrl: null,
      reachable: false,
      codePresent: false,
      chainId: null,
      error: `initialization error: ${err.message}`,
    };
  }
}

export async function getDeploymentStatus() {
  const results = await Promise.all(EVM_CHAINS.map((c) => checkEvmChain(c)));
  const byChain = {};
  results.forEach((r) => (byChain[r.chain] = r));
  return byChain;
}

export async function validateStartup({ failOnMissing = false } = {}) {
  const status = await getDeploymentStatus();
  const missing = Object.values(status).filter((s) => !s.codePresent);
  if (missing.length > 0) {
    console.warn("Deployment validation: missing or empty contract code for chains:", missing.map((m) => m.chain));
    missing.forEach((m) => console.warn(JSON.stringify(m, null, 2)));
    if (failOnMissing) return { ok: false, missing };
  }
  return { ok: missing.length === 0, missing };
}

export default { getDeploymentStatus, validateStartup };
