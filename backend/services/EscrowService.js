import Transaction from "../models/Transaction.js";
import { getContractABI, getProvider } from "../utils/web3Utils.js";

class EscrowService {
  constructor() {
    this.escrowListeners = new Map();
  }

  /**
   * Create an escrow transaction on-chain
   */
  async createEscrow(userId, recipientTag, amount, token, lockPeriodDays, senderTag) {
    try {
      const lockPeriodSeconds = lockPeriodDays * 24 * 60 * 60;

      // Create off-chain transaction record first
      const transaction = await Transaction.create({
        user_id: userId,
        type: "escrow_pending",
        status: "pending",
        amount,
        token,
        sender_tag: senderTag,
        receiver_tag: recipientTag,
        chain: "ethereum", // Default to Ethereum for escrow
        metadata: {
          escrowType: "tagged_payment",
          lockPeriodSeconds,
          escrowContractAddress: process.env.ESCROW_CONTRACT_ADDRESS,
        },
      });

      return {
        success: true,
        transactionId: transaction.id,
        status: "escrow_created",
        message: "Escrow created successfully",
        data: transaction,
      };
    } catch (error) {
      console.error("Error creating escrow:", error);
      throw {
        code: "ESCROW_CREATION_FAILED",
        message: error.message,
        statusCode: 500,
      };
    }
  }

  /**
   * Listen for escrow state changes on-chain
   */
  async setupEscrowListener(escrowContractAddress) {
    try {
      const provider = getProvider("ethereum");
      const abi = getContractABI("TaggedEscrow");

      // Listen for EscrowReleased events
      provider.on(
        {
          address: escrowContractAddress,
          topics: [
            "0x" + Buffer.from("EscrowReleased(uint256,address,uint256)").toString("hex"),
          ],
        },
        async (log) => {
          await this.handleEscrowReleased(log);
        }
      );

      // Listen for EscrowCancelled events
      provider.on(
        {
          address: escrowContractAddress,
          topics: [
            "0x" + Buffer.from("EscrowCancelled(uint256,address,uint256)").toString("hex"),
          ],
        },
        async (log) => {
          await this.handleEscrowCancelled(log);
        }
      );

      console.log("Escrow listener setup complete for", escrowContractAddress);
    } catch (error) {
      console.error("Error setting up escrow listener:", error);
    }
  }

  /**
   * Handle EscrowReleased event and update transaction status
   */
  async handleEscrowReleased(log) {
    try {
      const escrowId = log.topics[1];
      const recipientAddress = "0x" + log.topics[2].slice(26);

      // Update transaction status to completed
      await Transaction.update(
        { metadata: { escrowId } },
        {
          status: "completed",
          type: "escrow_released",
          metadata: {
            releaseTimestamp: new Date().toISOString(),
            escrowReleaseBlockNumber: log.blockNumber,
          },
        }
      );

      console.log(`Escrow ${escrowId} released to ${recipientAddress}`);
    } catch (error) {
      console.error("Error handling escrow released:", error);
    }
  }

  /**
   * Handle EscrowCancelled event and update transaction status
   */
  async handleEscrowCancelled(log) {
    try {
      const escrowId = log.topics[1];
      const senderAddress = "0x" + log.topics[2].slice(26);

      // Update transaction status to cancelled
      await Transaction.update(
        { metadata: { escrowId } },
        {
          status: "cancelled",
          type: "escrow_cancelled",
          metadata: {
            cancellationTimestamp: new Date().toISOString(),
            escrowCancelBlockNumber: log.blockNumber,
          },
        }
      );

      console.log(`Escrow ${escrowId} cancelled for ${senderAddress}`);
    } catch (error) {
      console.error("Error handling escrow cancelled:", error);
    }
  }

  /**
   * Get escrow details by transaction ID
   */
  async getEscrowDetails(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      return {
        success: true,
        escrow: {
          transactionId: transaction.id,
          senderTag: transaction.sender_tag,
          recipientTag: transaction.receiver_tag,
          amount: transaction.amount,
          token: transaction.token,
          status: transaction.status,
          createdAt: transaction.created_at,
          metadata: transaction.metadata,
        },
      };
    } catch (error) {
      console.error("Error getting escrow details:", error);
      throw {
        code: "ESCROW_FETCH_FAILED",
        message: error.message,
        statusCode: 404,
      };
    }
  }

  /**
   * Get all escrows for a user
   */
  async getUserEscrows(userId, status = null) {
    try {
      const query = {
        user_id: userId,
        type: { $in: ["escrow_pending", "escrow_released", "escrow_cancelled"] },
      };

      if (status) {
        query.status = status;
      }

      const escrows = await Transaction.findAll(query);

      return {
        success: true,
        count: escrows.length,
        escrows: escrows.map((tx) => ({
          id: tx.id,
          senderTag: tx.sender_tag,
          recipientTag: tx.receiver_tag,
          amount: tx.amount,
          token: tx.token,
          status: tx.status,
          createdAt: tx.created_at,
          lockPeriod: tx.metadata?.lockPeriodSeconds,
        })),
      };
    } catch (error) {
      console.error("Error fetching user escrows:", error);
      throw {
        code: "ESCROW_LIST_FAILED",
        message: error.message,
        statusCode: 500,
      };
    }
  }

  /**
   * Calculate if an escrow lock period has expired
   */
  isLockPeriodExpired(createdAt, lockPeriodSeconds) {
    const createdTime = new Date(createdAt).getTime();
    const expiryTime = createdTime + lockPeriodSeconds * 1000;
    return Date.now() >= expiryTime;
  }

  /**
   * Get remaining lock time in seconds
   */
  getRemainingLockTime(createdAt, lockPeriodSeconds) {
    const createdTime = new Date(createdAt).getTime();
    const expiryTime = createdTime + lockPeriodSeconds * 1000;
    const remaining = Math.max(0, expiryTime - Date.now());
    return Math.ceil(remaining / 1000);
  }
}

export default new EscrowService();
