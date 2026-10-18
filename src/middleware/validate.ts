import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError, type ValidationDetail } from '../errors/AppError';

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      const details: ValidationDetail[] = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || 'body',
        message: issue.message,
      }));

      return next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Request validation failed',
          details,
        ),
      );
    }

    request.body = result.data;
    return next();
  };
}
