import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'client'], default: 'client', index: true },
    // Set for role "client" — scopes every query to this client's data
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
