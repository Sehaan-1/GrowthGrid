import { Router } from 'express';
import Campaign from '../models/Campaign.js';
import Lead from '../models/Lead.js';
import MetricSnapshot from '../models/MetricSnapshot.js';
import Notification from '../models/Notification.js';
import { authRequired } from '../middleware/auth.js';
import { scopeFilter, userClientId } from '../util/tenancy.js';
import { lastNDays } from '../services/sync.js';

const router = Router();
router.use(authRequired);

const round2 = (n) => Math.round(n * 100) / 100;
const pct = (cur, prev) => (prev > 0 ? round2(((cur - prev) / prev) * 100) : 0);

router.get('/overview', async (req, res, next) => {
  try {
    const clientId = userClientId(req.user);
    const days14 = lastNDays(14);
    const since14 = days14[0];
    const sincePrev14 = lastNDays(28)[0];

    const campaignFilter = clientId ? { client: clientId } : {};
    const campaignIds = await Campaign.find(campaignFilter).distinct('_id');

    // Daily series for the last 14 days across the caller's campaigns.
    const daily = await MetricSnapshot.aggregate([
      { $match: { campaign: { $in: campaignIds }, date: { $gte: since14 } } },
      { $group: { _id: '$date', spend: { $sum: '$spend' }, leads: { $sum: '$leads' } } },
    ]);
    const byDate = new Map(daily.map((d) => [d._id, d]));
    const series = days14.map((date) => ({
      date,
      spend: round2(byDate.get(date)?.spend ?? 0),
      leads: byDate.get(date)?.leads ?? 0,
    }));

    const cur = { spend: 0, leads: 0, impressions: 0, clicks: 0 };
    for (const d of daily) {
      cur.spend += d.spend;
      cur.leads += d.leads;
    }
    const [impClick] = await MetricSnapshot.aggregate([
      { $match: { campaign: { $in: campaignIds }, date: { $gte: since14 } } },
      { $group: { _id: null, impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } },
    ]);
    cur.impressions = impClick?.impressions ?? 0;
    cur.clicks = impClick?.clicks ?? 0;

    const [prev] = await MetricSnapshot.aggregate([
      { $match: { campaign: { $in: campaignIds }, date: { $gte: sincePrev14, $lt: since14 } } },
      { $group: { _id: null, spend: { $sum: '$spend' }, leads: { $sum: '$leads' } } },
    ]);
    const prevSpend = prev?.spend ?? 0;
    const prevLeads = prev?.leads ?? 0;

    const platformSplitRaw = await MetricSnapshot.aggregate([
      { $match: { campaign: { $in: campaignIds }, date: { $gte: since14 } } },
      {
        $lookup: {
          from: 'campaigns',
          localField: 'campaign',
          foreignField: '_id',
          as: 'c',
        },
      },
      { $unwind: '$c' },
      { $group: { _id: '$c.platform', spend: { $sum: '$spend' }, leads: { $sum: '$leads' } } },
      { $sort: { spend: -1 } },
    ]);

    const [activeCampaigns, flaggedCampaigns, recentLeads, notifications] = await Promise.all([
      Campaign.countDocuments({ ...campaignFilter, status: 'active' }),
      Campaign.find({ ...campaignFilter, flagged: true }).select('name flagReason platform').lean(),
      Lead.find(scopeFilter(req.user)).sort({ createdAt: -1 }).limit(5).populate('campaign', 'name platform').lean(),
      Notification.find(scopeFilter(req.user)).sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    res.json({
      stats: {
        spend14d: round2(cur.spend),
        leads14d: cur.leads,
        impressions14d: cur.impressions,
        clicks14d: cur.clicks,
        avgCpl: cur.leads > 0 ? round2(cur.spend / cur.leads) : 0,
        cplDelta: prevLeads > 0 && cur.leads > 0 ? pct(cur.spend / cur.leads, prevSpend / prevLeads) : 0,
        activeCampaigns,
        flaggedCount: flaggedCampaigns.length,
      },
      series,
      platformSplit: platformSplitRaw.map((p) => ({ platform: p._id, spend: round2(p.spend), leads: p.leads })),
      flagged: flaggedCampaigns,
      recentLeads,
      notifications,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
