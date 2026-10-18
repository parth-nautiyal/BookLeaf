import mongoose from 'mongoose';
import { getMongoDbUri } from './env';

export async function connectToDatabase(): Promise<typeof mongoose.connection> {
  await mongoose.connect(getMongoDbUri(), { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
