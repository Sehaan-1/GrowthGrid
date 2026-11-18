import { Router } from 'express';
import Campaign from '../models/Campaign.js';
import Client from '../models/Client.js';
import MetricSnapshot from '../models/MetricSnapshot.js';
import { authRequired, requireAdmin } from '../middleware/auth.js';
import { lastNDays } from '../services/sync.js';

const router = Router();
// Client management is an agency-side view.
router.use(authRequired, requireAdmin);

const round2 = (n) => Math.round(n * 100) / 100;

router.get('/', async (req, res, next) => {
  try {
    const clients = await Client.find({}).sort({ name: 1 }).lean();
    const ids = clients.map((c) => c._id);
    const since14 = lastNDays(14)[0];

    const [campaignCounts, spend14] = await Promise.all([
      Campaign.aggregate([
        { $match: { client: { $in: ids } } },
        {
          $group: {
            _id: '$client',
            campaigns: { $sum: 1 },
            activeCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          },
        },
      ]),
      MetricSnapshot.aggregate([
        { $match: { date: { $gte: since14 } } },
        {
          $lookup: {
            from: 'campaigns',
            localField: 'campaign',
            foreignField: '_id',
            as: 'c',
          },
        },
        { $unwind: '$c' },
        { $match: { 'c.client': { $in: ids } } },
        { $group: { _id: '$c.client', spend: { $sum: '$spend' }, leads: { $sum: '$leads' } } },
      ]),
    ]);
    const countMap = new Map(campaignCounts.map((r) => [r._id.toString(), r]));
    const spendMap = new Map(spend14.map((r) => [r._id.toString(), r]));

    res.json({
      clients: clients.map((c) => {
        const key = c._id.toString();
        const counts = countMap.get(key);
        const agg = spendMap.get(key);
        return {
          _id: c._id,
          name: c.name,
          industry: c.industry,
          contactName: c.contactName,
          contactEmail: c.contactEmail,
          stats: {
            spend14d: round2(agg?.spend ?? 0),
            leads14d: agg?.leads ?? 0,
            activeCampaigns: counts?.activeCampaigns ?? 0,
            campaigns: counts?.campaigns ?? 0,
          },
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
