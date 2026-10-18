import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError';

interface BodyParserError {
  type: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string'
  );
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  if (isBodyParserError(error) && error.type === 'entity.parse.failed') {
    return response.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
  }

  if (isBodyParserError(error) && error.type === 'entity.too.large') {
    return response.status(400).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the 100kb limit',
      },
    });
  }

  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(`Unhandled request error (${errorName})`);

  return response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
