import { ethers } from "ethers";
import { getEvmProvider } from "../contracts/index.js";
import db from "../config/database.js";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const MAX_UINT256 = ethers.MaxUint256;

class ERC20AllowanceService {
  async getAllowance(chain, tokenAddress, userAddress, spenderAddress) {
    try {
      const provider = getEvmProvider(chain);
      const erc20 = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
      );

      const allowance = await erc20.allowance(userAddress, spenderAddress);
      return allowance.toString();
    } catch (error) {
      console.error(`Failed to check allowance on ${chain}:`, error.message);
      return "0";
    }
  }

  async requiresApproval(chain, tokenAddress, userAddress, spenderAddress, amount) {
    const allowance = await this.getAllowance(chain, tokenAddress, userAddress, spenderAddress);
    const requiredAmount = ethers.parseUnits(amount.toString(), 18);
    return BigInt(allowance) < requiredAmount;
  }

  async getApprovalStatus(userAddress, chain, tokenId) {
    try {
      const token = await db("tokens").where({ id: tokenId }).first();
      if (!token) return null;

      const tokenAddress = process.env[`${chain.toUpperCase()}_${token.symbol}_ADDRESS`] ||
                          process.env[`${chain.toUpperCase()}_TOKEN_ADDRESS`];

      if (!tokenAddress) return null;

      const contractAddress = process.env[`${chain.toUpperCase()}_CONTRACT_ADDRESS`];
      if (!contractAddress) return null;

      const allowance = await this.getAllowance(chain, tokenAddress, userAddress, contractAddress);

      return {
        tokenId,
        tokenSymbol: token.symbol,
        chain,
        tokenAddress,
        spenderAddress: contractAddress,
        allowance: allowance.toString(),
        isApproved: BigInt(allowance) > 0n,
      };
    } catch (error) {
      console.error("Failed to get approval status:", error.message);
      return null;
    }
  }

  async getMultipleAllowances(userAddress, chain, tokenIds) {
    const results = await Promise.all(
      tokenIds.map(tokenId => this.getApprovalStatus(userAddress, chain, tokenId))
    );
    return results.filter(r => r !== null);
  }
}

export default new ERC20AllowanceService();
