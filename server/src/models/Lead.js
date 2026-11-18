import mongoose from 'mongoose';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

const leadSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
    value: { type: Number, default: 0, min: 0 }, // deal value, INR
    source: { type: String, enum: ['google', 'meta', 'manual'], default: 'manual' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

leadSchema.index({ client: 1, status: 1 });
leadSchema.index({ client: 1, createdAt: -1 });

export default mongoose.model('Lead', leadSchema);
