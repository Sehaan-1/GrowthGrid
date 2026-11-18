import mongoose from 'mongoose';

// One row per campaign per day, upserted by the ad sync engine.
const metricSnapshotSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    spend: { type: Number, default: 0, min: 0 }, // INR
    leads: { type: Number, default: 0, min: 0 },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

metricSnapshotSchema.index({ campaign: 1, date: 1 }, { unique: true });

metricSnapshotSchema.virtual('cpl').get(function () {
  return this.leads > 0 ? this.spend / this.leads : null;
});

metricSnapshotSchema.virtual('ctr').get(function () {
  return this.impressions > 0 ? this.clicks / this.impressions : null;
});

metricSnapshotSchema.virtual('cpc').get(function () {
  return this.clicks > 0 ? this.spend / this.clicks : null;
});

export default mongoose.model('MetricSnapshot', metricSnapshotSchema);
