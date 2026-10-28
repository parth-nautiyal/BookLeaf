import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { getClientUrl } from './config/env';
import authRouter from './routes/auth';
import booksRouter from './routes/books';
import healthRouter from './routes/health';
import ticketsRouter from './routes/tickets';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    ...(process.env.NODE_ENV === 'production' ? {} : { hsts: false }),
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, false);
      }

      return callback(null, origin === getClientUrl());
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/books', booksRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
