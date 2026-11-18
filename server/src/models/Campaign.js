import mongoose from 'mongoose';

export const PLATFORMS = ['google', 'meta'];
export const CAMPAIGN_STATUSES = ['active', 'paused'];

const campaignSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true, trim: true },
    platform: { type: String, enum: PLATFORMS, required: true, index: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'active', index: true },
    // Identifier on the ad platform this campaign syncs from (simulated)
    externalId: { type: String, required: true },
    dailyBudget: { type: Number, required: true, min: 0 }, // INR per day
    totalBudget: { type: Number, default: 0, min: 0 }, // INR lifetime cap, 0 = uncapped
    cplThreshold: { type: Number, default: 0, min: 0 }, // auto-flag when CPL crosses this, 0 = rule off
    flagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: '' },
  },
  { timestamps: true }
);

campaignSchema.index({ client: 1, platform: 1 });

export default mongoose.model('Campaign', campaignSchema);
