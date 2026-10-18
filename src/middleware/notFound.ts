import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};
