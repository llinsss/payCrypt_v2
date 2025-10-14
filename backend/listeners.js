import { startBalancePoller } from "./listeners/balance.js";
import { startStarknetListener } from "./listeners/starknet.js";

startStarknetListener();
startBalancePoller();
