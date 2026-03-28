import "./workers/balance.js";
import "./workers/scheduler.js";
import "./workers/transactionConfirmation.js";
import "./queues/exportQueue.js";
import UssdService from "./services/UssdService.js";
// import "./workers/starknet.js";

// Clean up expired USSD sessions every 5 minutes
setInterval(() => {
  UssdService.cleanupExpiredSessions();
}, 5 * 60 * 1000);
