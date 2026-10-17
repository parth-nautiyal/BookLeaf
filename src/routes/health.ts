import express, { type Request, type Response } from 'express';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/', (_request: Request, response: Response) => {
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({
      status: 'error',
      database: 'disconnected'
    });
  }

  return response.status(200).json({
    status: 'ok',
    database: 'connected'
  });
});

export default router;
