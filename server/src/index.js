import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import config from './config.js';
import { connectMongo } from './db.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import campaignRoutes from './routes/campaigns.js';
import leadRoutes from './routes/leads.js';
import clientRoutes from './routes/clients.js';
import syncRoutes from './routes/sync.js';
import { backfillHistory, runSync, seedDemoData } from './services/sync.js';

const app = express();

app.use(cors({ origin: config.clientOrigin === '*' ? true : config.clientOrigin }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'growthgrid-api' }));

// Convenience: anyone who opens the API server itself in a browser (instead of
// the client) gets bounced to the UI. Works on localhost and on preview hosts
// where the port is part of the hostname (<port>-<id>.e2b.app).
app.get('/', (req, res) => {
  const host = req.headers.host || '';
  const preview = host.match(/^\d+-([a-z0-9-]+\.e2b\.app)$/i);
  const target = preview ? `https://5173-${preview[1]}` : config.clientOrigin;
  res.redirect(302, target);
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/sync', syncRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[api] ${req.method} ${req.path} failed:`, err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong on our side' });
});

async function start() {
  let memoryServer = null;
  if (config.preferMemoryDb) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    await connectMongo(memoryServer.getUri('growthgrid'));
  } else {
    try {
      await connectMongo(config.mongoUri);
    } catch (err) {
      // No local MongoDB? Fall back to an in-memory replica so the demo still runs.
      console.warn(`[db] could not reach ${config.mongoUri} (${err.message}) — starting in-memory MongoDB`);
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      await connectMongo(memoryServer.getUri('growthgrid'));
    }
  }
  console.log(`[db] connected${memoryServer ? ' (in-memory)' : ''}`);

  if (config.seedDemoData) {
    const demo = await seedDemoData();
    if (demo) {
      await backfillHistory({ days: 14 });
      await runSync({ trigger: 'startup' });
      console.log(`[seed] demo workspace ready — 2 clients, 5 campaigns, 14 days of metrics, 26 leads`);
      console.log(`[seed] admin:  ${demo.admin.email} / ${demo.admin.password}`);
      console.log(`[seed] client: ${demo.client.email} / ${demo.client.password} (Meridian Realty)`);
    }
  }

  // Refresh platform data every 15 minutes.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { synced, flagged } = await runSync({ trigger: 'cron' });
      console.log(`[cron] sync complete — ${synced} campaign-days, ${flagged} flagged`);
    } catch (err) {
      console.error('[cron] sync failed:', err);
    }
  });

  app.listen(config.port, () => {
    console.log(`[api] GrowthGrid API on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
