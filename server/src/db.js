import mongoose from 'mongoose';
import config from './config.js';

export async function connectMongo(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
