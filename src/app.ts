import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    ...(process.env.NODE_ENV === 'production' ? {} : { hsts: false }),
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
