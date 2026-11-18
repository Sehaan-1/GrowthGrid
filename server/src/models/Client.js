import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true, default: '' },
    contactEmail: { type: String, lowercase: true, trim: true, default: '' },
    industry: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Client', clientSchema);
