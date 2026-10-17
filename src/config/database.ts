import mongoose from 'mongoose';

export async function connectToDatabase(): Promise<typeof mongoose.connection> {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required to connect to MongoDB.');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
