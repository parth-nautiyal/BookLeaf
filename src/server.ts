import app from './app';
import { connectToDatabase } from './config/database';
import { getRuntimeConfig } from './config/env';

async function startServer(): Promise<void> {
  const config = getRuntimeConfig();
  await connectToDatabase();

  app.listen(config.port, () => {
    console.info(`BookLeaf API listening on port ${config.port}.`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Unable to start the BookLeaf API:', error);
  process.exitCode = 1;
});
