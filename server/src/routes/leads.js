import { Router } from 'express';
import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import Lead from '../models/Lead.js';
import { authRequired } from '../middleware/auth.js';
import { campaignVisibleTo, scopeFilter } from '../util/tenancy.js';

const router = Router();
router.use(authRequired);

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

router.get('/', async (req, res, next) => {
  try {
    const leads = await Lead.find(scopeFilter(req.user))
      .sort({ createdAt: -1 })
      .limit(300)
      .populate('campaign', 'name platform')
      .lean();
    res.json({ leads });
  } catch (err) {
    next(err);
  }
});

// Manually captured lead (walk-in, referral, phone enquiry...).
router.post('/', async (req, res, next) => {
  try {
    const { name, email = '', phone = '', campaign, value = 0, notes = '' } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'Lead name is required' });

    let campaignDoc = null;
    if (campaign) {
      if (!mongoose.isValidObjectId(campaign)) return res.status(400).json({ error: 'Invalid campaign id' });
      campaignDoc = await Campaign.findById(campaign);
      if (!campaignDoc || !campaignVisibleTo(req.user, campaignDoc)) {
        return res.status(400).json({ error: 'Campaign not found' });
      }
    }
    const clientId = campaignDoc?.client ?? req.user.client?._id ?? null;
    if (!clientId) {
      return res.status(400).json({ error: 'Pick a campaign so the lead can be attributed to a client' });
    }

    const lead = await Lead.create({
      client: clientId,
      campaign: campaignDoc?._id ?? null,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      value: Math.max(0, Number(value) || 0),
      notes: notes.trim(),
      source: campaignDoc ? campaignDoc.platform : 'manual',
      status: 'new',
    });
    await lead.populate('campaign', 'name platform');
    return res.status(201).json({ lead });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid lead id' });
    }
    const lead = await Lead.findOne({ _id: req.params.id, ...scopeFilter(req.user) });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { status } = req.body ?? {};
    if (!LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${LEAD_STATUSES.join(', ')}` });
    }
    lead.status = status;
    await lead.save();
    await lead.populate('campaign', 'name platform');
    return res.json({ lead });
  } catch (err) {
    return next(err);
  }
});

export default router;
