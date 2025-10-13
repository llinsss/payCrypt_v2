import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { balanceQueue } from "./queues/balance.js";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/running-queues");

createBullBoard({
  queues: [new BullMQAdapter(balanceQueue, { name: "Balance Queue" })],
  serverAdapter,
});

export default serverAdapter;
