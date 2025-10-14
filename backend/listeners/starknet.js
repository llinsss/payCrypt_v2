import { starknetQueue } from "../queues/starknet.js";
import { getContract, utils } from "../starknet-contract.js";

const { contract, provider } = getContract();

let lastBlock = 0;

export const startStarknetListener = async () => {
  console.log("🔍 Starting StarkNet event listener...");

  const latest = await provider.getBlockNumber();
  lastBlock = latest;

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();

      if (currentBlock > lastBlock) {
        console.log(`🧱 New block detected: ${currentBlock}`);

        const events = await provider.getEvents({
          from_block: { block_number: lastBlock },
          to_block: { block_number: currentBlock },
          address: contract.address,
        });

        for (const e of events.events) {
          const parsed = contract.parseEvents([e]);
          if (parsed.length) {
            const event = parsed[0];

            // Handle only relevant ones
            if (
              ["DepositReceived", "WithdrawalCompleted"].includes(event.name)
            ) {
              const data = {
                type: event.name,
                ...Object.fromEntries(
                  Object.entries(event.data).map(([k, v]) => [
                    k,
                    utils.feltToString(v) || v,
                  ])
                ),
                txHash: e.transaction_hash,
                timestamp: Date.now(),
              };

              await starknetQueue.add("handleEvent", data);
              console.log(`📤 Queued event: ${event.name}`);
            }
          }
        }

        lastBlock = currentBlock;
      }
    } catch (err) {
      console.error("⚠️ Listener error:", err);
    }
  }, 10_000); // poll every 10 seconds
};
