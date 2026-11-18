import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = ['cpl_alert', 'budget_alert', 'sync', 'info'];

// Scoped to a client: admins see all, client users see only their own.
const notificationSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'info', index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ client: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
