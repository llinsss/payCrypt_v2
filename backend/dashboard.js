import express from 'express';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { balanceQueue } from "./config/queue.js";


const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(balanceQueue)],
  serverAdapter,
});

const app = express();
app.use("/admin/queues", serverAdapter.getRouter());

const PORT = process.env.DASHBOARD_PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Bull Board running at http://localhost:${PORT}/admin/queues`);
});
