import { Router } from 'express';
import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import MetricSnapshot from '../models/MetricSnapshot.js';
import { authRequired } from '../middleware/auth.js';
import { campaignVisibleTo, userClientId } from '../util/tenancy.js';
import { lastNDays } from '../services/sync.js';

const router = Router();
router.use(authRequired);

const round2 = (n) => Math.round(n * 100) / 100;
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

async function attachStats(campaigns) {
  const ids = campaigns.map((c) => c._id);
  const since14 = lastNDays(14)[0];

  const [rows14, totals] = await Promise.all([
    MetricSnapshot.aggregate([
      { $match: { campaign: { $in: ids }, date: { $gte: since14 } } },
      { $group: { _id: '$campaign', spend: { $sum: '$spend' }, leads: { $sum: '$leads' } } },
    ]),
    MetricSnapshot.aggregate([
      { $match: { campaign: { $in: ids } } },
      { $group: { _id: '$campaign', spend: { $sum: '$spend' } } },
    ]),
  ]);
  const map14 = new Map(rows14.map((r) => [r._id.toString(), r]));
  const mapAll = new Map(totals.map((r) => [r._id.toString(), r]));

  return campaigns.map((c) => {
    const key = c._id.toString();
    const cur = map14.get(key);
    const cpl14 = cur && cur.leads > 0 ? round2(cur.spend / cur.leads) : null;
    let utilization = null;
    let utilizationLabel = 'No budget cap';
    if (c.totalBudget > 0) {
      const spent = mapAll.get(key)?.spend ?? 0;
      utilization = round2(Math.min(9.99, spent / c.totalBudget));
      utilizationLabel = `${Math.round(utilization * 100)}% of ${inr(c.totalBudget)}`;
    }
    return {
      _id: c._id,
      name: c.name,
      platform: c.platform,
      status: c.status,
      flagged: c.flagged,
      flagReason: c.flagReason || undefined,
      dailyBudget: c.dailyBudget,
      totalBudget: c.totalBudget,
      cplThreshold: c.cplThreshold,
      client: c.client && c.client.name ? { id: c.client._id, name: c.client.name } : { id: c.client },
      stats: { cpl14, utilization, utilizationLabel },
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const clientId = userClientId(req.user);
    const filter = clientId ? { client: clientId } : {};
    const campaigns = await Campaign.find(filter)
      .populate('client', 'name')
      .sort({ flagged: -1, createdAt: 1 })
      .lean({ virtuals: false });
    res.json({ campaigns: await attachStats(campaigns) });
  } catch (err) {
    next(err);
  }
});

// Pause/resume a campaign or clear its flag: PATCH { status } or { flagged:false }.
router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign || !campaignVisibleTo(req.user, campaign)) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { status, flagged } = req.body ?? {};
    if (status !== undefined) {
      if (!['active', 'paused'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "active" or "paused"' });
      }
      campaign.status = status;
      if (status === 'paused' && flagged === undefined) {
        campaign.flagged = false;
        campaign.flagReason = '';
      }
    }
    if (flagged === false) {
      campaign.flagged = false;
      campaign.flagReason = '';
    } else if (flagged !== undefined && flagged !== true) {
      return res.status(400).json({ error: 'flagged can only be cleared (false)' });
    }
    if (status === undefined && flagged === undefined) {
      return res.status(400).json({ error: 'Nothing to update — send status or flagged' });
    }

    await campaign.save();
    await campaign.populate('client', 'name');
    const [withStats] = await attachStats([campaign.toObject({ virtuals: false })]);
    return res.json({ campaign: withStats });
  } catch (err) {
    return next(err);
  }
});

export default router;
