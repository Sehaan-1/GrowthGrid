#!/usr/bin/env node
// Seed the connected MongoDB with the demo workspace: one agency client, three
// campaigns (Google + Meta), an admin login, 14 days of metric history and a
// fresh sync on top. Idempotent — re-running only tops up data.
//
//   MONGODB_URI=mongodb://127.0.0.1:27017/growthgrid npm run seed
import config from '../src/config.js';
import { connectMongo, disconnectMongo } from '../src/db.js';
import { backfillHistory, runSync, seedDemoData } from '../src/services/sync.js';

async function main() {
  await connectMongo(process.env.MONGODB_URI || config.mongoUri);
  console.log(`[seed] connected to ${process.env.MONGODB_URI || config.mongoUri}`);

  const demo = await seedDemoData();
  if (!demo) {
    console.log('[seed] demo workspace already present — nothing to do');
  } else {
    const backfilled = await backfillHistory({ days: 14 });
    const { synced, flagged } = await runSync({ trigger: 'seed' });
    console.log(`[seed] ${backfilled} historical snapshots backfilled, ${synced} campaign-days synced, ${flagged} campaigns flagged`);
    console.log(`[seed] admin:  ${demo.admin.email} / ${demo.admin.password}`);
    console.log(`[seed] client: ${demo.client.email} / ${demo.client.password} (Meridian Realty)`);
  }

  await disconnectMongo();
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
