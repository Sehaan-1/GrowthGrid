import Campaign from '../models/Campaign.js';
import Client from '../models/Client.js';
import Lead from '../models/Lead.js';
import MetricSnapshot from '../models/MetricSnapshot.js';
import Notification from '../models/Notification.js';
import { fetchDailyMetrics, makePlan } from './adPlatforms.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const isoDay = (d) => d.toISOString().slice(0, 10);

export function lastNDays(n, from = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDay(new Date(from - i * DAY_MS)));
  return out;
}

// The sync engine keeps per-campaign simulation state outside Mongoose: ad data
// is re-pulled from the platforms on every sync, so the plans only need to live
// for the process lifetime (they regenerate after a restart).
const plans = new Map();
const syncedCampaignDay = new Set();
let runNumber = 0;

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function planFor(campaign) {
  if (!plans.has(campaign._id.toString())) {
    plans.set(campaign._id.toString(), makePlan(`${campaign.platform}:${campaign.externalId}`));
  }
  return plans.get(campaign._id.toString());
}

async function notify({ client, campaign = null, type, title, message }) {
  const doc = await Notification.create({ client, campaign, type, title, message });
  return doc.toObject();
}

// ---- Automation rules -------------------------------------------------------
// 1. CPL threshold: flag any active campaign whose trailing-14-day CPL crosses
//    its configured threshold, and raise a cpl_alert notification the first time.
// 2. Budget utilization: when lifetime spend passes 90% of the total budget,
//    raise a budget_alert (at most one per campaign per day).
async function applyAutomationRules(campaign, alerts) {
  let flaggedNow = false;

  if (campaign.status === 'active' && campaign.cplThreshold > 0) {
    const since = lastNDays(14)[0];
    const [agg] = await MetricSnapshot.aggregate([
      { $match: { campaign: campaign._id, date: { $gte: since } } },
      { $group: { _id: null, spend: { $sum: '$spend' }, leads: { $sum: '$leads' } } },
    ]);
    const cpl14 = agg && agg.leads > 0 ? agg.spend / agg.leads : null;

    if (cpl14 != null && cpl14 > campaign.cplThreshold) {
      const reason = `CPL ${inr(cpl14)} is above the ${inr(campaign.cplThreshold)} threshold`;
      const over = Math.round(((cpl14 - campaign.cplThreshold) / campaign.cplThreshold) * 100);
      const alreadyFlagged = campaign.flagged;
      await Campaign.updateOne({ _id: campaign._id }, { $set: { flagged: true, flagReason: reason } });
      campaign.flagged = true;
      campaign.flagReason = reason;
      flaggedNow = true;
      if (!alreadyFlagged) {
        alerts.push(
          await notify({
            client: campaign.client,
            campaign: campaign._id,
            type: 'cpl_alert',
            title: `CPL alert: ${campaign.name}`,
            message: `Cost per lead hit ${inr(cpl14)} over the last 14 days — ${over}% above the ${inr(
              campaign.cplThreshold
            )} threshold. The campaign was flagged for review.`,
          })
        );
      }
    }
  }

  if (campaign.totalBudget > 0) {
    const [agg] = await MetricSnapshot.aggregate([
      { $match: { campaign: campaign._id } },
      { $group: { _id: null, spend: { $sum: '$spend' } } },
    ]);
    const totalSpend = agg?.spend ?? 0;
    const utilization = totalSpend / campaign.totalBudget;
    if (utilization >= 0.9) {
      const alreadyRaisedToday = await Notification.exists({
        campaign: campaign._id,
        type: 'budget_alert',
        createdAt: { $gte: new Date(Date.now() - DAY_MS) },
      });
      if (!alreadyRaisedToday) {
        const pct = Math.round(utilization * 100);
        alerts.push(
          await notify({
            client: campaign.client,
            campaign: campaign._id,
            type: 'budget_alert',
            title: `Budget alert: ${campaign.name}`,
            message: `Lifetime spend ${inr(totalSpend)} is ${pct}% of the ${inr(campaign.totalBudget)} budget.`,
          })
        );
      }
    }
  }

  return flaggedNow;
}

// ---- Sync engine -------------------------------------------------------------
// Pulls metrics for every campaign across every connected platform, upserts one
// MetricSnapshot per campaign/day, materializes the generated leads and then
// runs the automation rules. Called by POST /api/sync and by the 15-min cron.
export async function runSync({ days = 7, trigger = 'manual' } = {}) {
  runNumber += 1;
  const now = Date.now();
  const dates = lastNDays(days);
  const campaigns = await Campaign.find({});
  const alerts = [];
  let synced = 0;
  let flagged = 0;

  for (const campaign of campaigns) {
    const plan = planFor(campaign);

    // Ground truth the platform reports for the days we are about to pull.
    const platformRows = dates.map((date, i) =>
      fetchDailyMetrics({ campaign, plan, date, ageDays: dates.length - 1 - i })
    );

    // Past days are immutable actuals — like the real platforms, a sync never
    // restates history (pausing a campaign must not erase what it already spent).
    // Today's row is always refreshed (intraday restatement) and gaps are filled.
    const today = dates[dates.length - 1];
    const existingDates = new Set(
      (
        await MetricSnapshot.find({ campaign: campaign._id, date: { $in: dates } })
          .select('date')
          .lean()
      ).map((d) => d.date)
    );

    for (const row of platformRows) {
      if (row.date !== today && existingDates.has(row.date)) continue;
      await MetricSnapshot.updateOne(
        { campaign: campaign._id, date: row.date },
        {
          $set: {
            impressions: row.impressions,
            clicks: row.clicks,
            spend: row.spend,
            leads: row.leads,
            syncedAt: new Date(now),
          },
        },
        { upsert: true }
      );
      synced += 1;
    }

    // Materialize leads for today's report (only once per campaign per day, so
    // the 15-min cron doesn't multiply them).
    const todayRow = platformRows[platformRows.length - 1];
    const dayKey = `${campaign._id}:${todayRow.date}`;
    if (todayRow.leads > 0 && !syncedCampaignDay.has(dayKey)) {
      syncedCampaignDay.add(dayKey);
      const docs = pickNames(todayRow.leads, plan.seed).map((name, i) => ({
        client: campaign.client,
        campaign: campaign._id,
        name,
        email: emailFor(name),
        phone: phoneFor(plan.seed, i),
        status: 'new',
        value: [15000, 25000, 40000, 60000][hashInt(`${plan.seed}:${i}`) % 4],
        source: campaign.platform,
        notes: `Captured via ${campaign.platform} lead form`,
      }));
      await Lead.insertMany(docs);
    }

    if (await applyAutomationRules(campaign, alerts)) flagged += 1;
  }

  const countsByClient = new Map();
  for (const c of campaigns) {
    const key = c.client.toString();
    countsByClient.set(key, (countsByClient.get(key) ?? 0) + 1);
  }
  for (const [clientId, count] of countsByClient) {
    alerts.push(
      await notify({
        client: clientId,
        type: 'sync',
        title: trigger === 'cron' ? 'Scheduled sync completed' : 'Sync completed',
        message: `Pulled the latest metrics for ${count} campaign${count === 1 ? '' : 's'} from Google Ads and Meta.`,
      })
    );
  }

  return { synced, flagged, alerts };
}

// ---- Backfill ---------------------------------------------------------------
// Historical baseline so a fresh database opens with context: seeds
// MetricSnapshots for the `days` before today and lets the regular sync add
// today on top.
export async function backfillHistory({ days = 14 } = {}) {
  const campaigns = await Campaign.find({});
  let seeded = 0;
  for (const campaign of campaigns) {
    const plan = planFor(campaign);
    for (const date of lastNDays(days + 1).slice(0, days)) {
      const ageDays = Math.round((Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / DAY_MS);
      const row = fetchDailyMetrics({ campaign, plan, date, ageDays });
      await MetricSnapshot.updateOne(
        { campaign: campaign._id, date: row.date },
        {
          $set: {
            impressions: row.impressions,
            clicks: row.clicks,
            spend: row.spend,
            leads: row.leads,
            syncedAt: new Date(Date.now() - ageDays * DAY_MS),
          },
        },
        { upsert: true }
      );
      seeded += 1;
    }
  }
  return seeded;
}

// First-boot demo content: two agency clients with five campaigns between
// them, 26 leads across the pipeline, 14 days of metric history and a fresh
// sync on top. Idempotent — returns null when the demo accounts already exist.
export async function seedDemoData() {
  const ADMIN = { name: 'Ava Shah', email: 'admin@growthgrid.dev', password: 'admin123' };
  const CLIENT_USER = { name: 'Nikhil Rao', email: 'client@growthgrid.dev', password: 'client123' };
  const { default: User } = await import('../models/User.js');
  const { default: bcrypt } = await import('bcryptjs');

  if (await User.findOne({ email: ADMIN.email })) return null;

  const [meridian, pixelPour] = await Promise.all([
    Client.findOneAndUpdate(
      { name: 'Meridian Realty' },
      { $setOnInsert: { name: 'Meridian Realty', contactName: CLIENT_USER.name, contactEmail: CLIENT_USER.email, industry: 'Real estate' } },
      { upsert: true, new: true }
    ),
    Client.findOneAndUpdate(
      { name: 'Pixel & Pour' },
      { $setOnInsert: { name: 'Pixel & Pour', contactName: 'Diya Singh', contactEmail: 'hello@pixelandpour.in', industry: 'Food & beverage' } },
      { upsert: true, new: true }
    ),
  ]);

  await User.create({
    name: ADMIN.name,
    email: ADMIN.email,
    passwordHash: await bcrypt.hash(ADMIN.password, 10),
    role: 'admin',
  });
  await User.create({
    name: CLIENT_USER.name,
    email: CLIENT_USER.email,
    passwordHash: await bcrypt.hash(CLIENT_USER.password, 10),
    role: 'client',
    client: meridian._id,
  });

  const campaigns = await Campaign.insertMany([
    { client: meridian._id, name: 'Pune Villas — Search', platform: 'google', status: 'active', externalId: 'ggl-1001', dailyBudget: 8500, totalBudget: 510000, cplThreshold: 1200 },
    { client: meridian._id, name: 'Mumbai Pre-launch — Leads', platform: 'meta', status: 'active', externalId: 'meta-2044', dailyBudget: 6000, totalBudget: 300000, cplThreshold: 950 },
    { client: meridian._id, name: 'Festive Remarketing', platform: 'meta', status: 'paused', externalId: 'meta-2099', dailyBudget: 2500, totalBudget: 75000, cplThreshold: 0 },
    { client: pixelPour._id, name: 'Weekend Brunch — Search', platform: 'google', status: 'active', externalId: 'ggl-3110', dailyBudget: 3500, totalBudget: 105000, cplThreshold: 0 },
    { client: pixelPour._id, name: 'Monsoon Menu — Reels', platform: 'meta', status: 'active', externalId: 'meta-3152', dailyBudget: 2800, totalBudget: 84000, cplThreshold: 0 },
  ]);

  // Exactly 26 leads, spread across all five campaigns, the full status
  // pipeline and the last ~14 days so filters and "added" columns look real.
  const STATUSES = [
    'new', 'contacted', 'new', 'qualified', 'new', 'won', 'contacted', 'lost', 'new',
    'qualified', 'new', 'contacted', 'won', 'new', 'qualified', 'contacted', 'lost',
    'new', 'won', 'contacted', 'new', 'qualified', 'lost', 'contacted', 'new', 'won',
  ];
  const PER_CAMPAIGN = [6, 6, 5, 5, 4]; // = 26
  const VALUES = [15000, 25000, 40000, 60000, 90000];
  const now = Date.now();
  const leads = [];
  let idx = 0;
  campaigns.forEach((campaign, ci) => {
    for (let k = 0; k < PER_CAMPAIGN[ci]; k++, idx++) {
      const name = `${FIRST[(idx * 7) % FIRST.length]} ${LAST[(idx * 3) % LAST.length]}`;
      leads.push({
        client: campaign.client,
        campaign: campaign._id,
        name,
        email: emailFor(name),
        phone: phoneFor(campaign.externalId, idx),
        status: STATUSES[idx],
        value: VALUES[idx % VALUES.length],
        source: campaign.platform,
        notes: `Captured via ${campaign.platform} lead form`,
        createdAt: new Date(now - (idx * 13 + 5) * 3600 * 1000),
      });
    }
  });
  await Lead.insertMany(leads);

  // Today's leads are already seeded — the startup sync must not add more, so
  // a fresh boot holds exactly 26.
  const today = isoDay(new Date(now));
  for (const campaign of campaigns) syncedCampaignDay.add(`${campaign._id}:${today}`);

  return { admin: ADMIN, client: CLIENT_USER };
}

// ---- Lead identity generation ------------------------------------------------
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Isha', 'Vikram', 'Anaya', 'Arjun', 'Sara', 'Nikhil', 'Priya'];
const LAST = ['Sharma', 'Patel', 'Iyer', 'Khan', 'Mehta', 'Reddy', 'Nair', 'Gupta', 'Joshi', 'Singh'];

const hashInt = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

function pickNames(count, seed) {
  const h = hashInt(seed);
  const names = [];
  for (let i = 0; i < count; i++) {
    names.push(`${FIRST[(h + i * 7) % FIRST.length]} ${LAST[(h + i * 3) % LAST.length]}`);
  }
  return names;
}

const emailFor = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@gmail.com`;
const phoneFor = (seed, i) => `+91 9${String(hashInt(`${seed}:ph:${i}`) % 1000000000).padStart(9, '0')}`;

// ---- Stats helpers (shared by routes) ----------------------------------------
export async function aggregateMetrics(match, since) {
  const [row] = await MetricSnapshot.aggregate([
    { $match: { ...match, date: { $gte: since } } },
    {
      $group: {
        _id: null,
        spend: { $sum: '$spend' },
        leads: { $sum: '$leads' },
        impressions: { $sum: '$impressions' },
        clicks: { $sum: '$clicks' },
      },
    },
  ]);
  return {
    spend: row?.spend ?? 0,
    leads: row?.leads ?? 0,
    impressions: row?.impressions ?? 0,
    clicks: row?.clicks ?? 0,
  };
}
