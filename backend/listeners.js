import { startBalancePoller } from "./listeners/balance.js";
import { startStarknetListener } from "./listeners/starknet.js";
import { startLiskListener } from "./listeners/lisk.js";

// Start all event listeners
startStarknetListener();
startBalancePoller();
startLiskListener();
