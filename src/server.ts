import 'dotenv/config';
import app from './app';
import { connectToDatabase } from './config/database';

async function startServer(): Promise<void> {
  await connectToDatabase();

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.info(`BookLeaf API listening on port ${port}.`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Unable to start the BookLeaf API:', error);
  process.exitCode = 1;
});
