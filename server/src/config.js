import dotenv from 'dotenv';

dotenv.config();

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/growthgrid',
  jwtSecret: process.env.JWT_SECRET || 'growthgrid-dev-secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  seedDemoData: bool(process.env.SEED_DEMO_DATA, true),
  // Skip connecting to a local Mongo entirely and go straight to the embedded
  // in-memory server (used by npm run demo for true zero-setup).
  preferMemoryDb: bool(process.env.PREFER_MEMORY_DB, false),
  nodeEnv: process.env.NODE_ENV || 'development',
};

export default config;
