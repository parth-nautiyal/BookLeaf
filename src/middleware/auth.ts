import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { getRuntimeConfig } from '../config/env';
import { AppError } from '../errors/AppError';
import { asyncHandler } from './asyncHandler';
import Author from '../models/Author';
import User, { type UserRole } from '../models/User';

export const AUTH_COOKIE_NAME = 'bookleaf_auth';
export const JWT_ALGORITHM = 'HS256';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  authorId: string | null;
}

function unauthorized(message = 'Authentication is required'): AppError {
  return new AppError(401, 'UNAUTHENTICATED', message);
}

export const requireAuth: RequestHandler = asyncHandler(
  async (request, _response, next) => {
    const token: unknown = request.cookies?.[AUTH_COOKIE_NAME];

    if (typeof token !== 'string' || token.length === 0) {
      throw unauthorized();
    }

    const { jwtSecret } = getRuntimeConfig();
    let payload: string | JwtPayload;

    try {
      payload = jwt.verify(token, jwtSecret, {
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      throw unauthorized('Authentication token is invalid or expired');
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof payload.sub !== 'string' ||
      !/^[a-f\d]{24}$/i.test(payload.sub) ||
      !Types.ObjectId.isValid(payload.sub)
    ) {
      throw unauthorized('Authentication token is invalid');
    }

    const user = await User.findById(payload.sub).select('email role author');

    if (!user) {
      throw unauthorized('Authentication user no longer exists');
    }

    let authorId: string | null = null;
    if (user.role === 'author' && user.author) {
      const author = await Author.findById(user.author)
        .select('authorId')
        .lean();
      authorId = author?.authorId ?? null;
    }

    request.authenticatedUser = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      authorId,
    };

    return next();
  },
);

export function requireRole(
  ...permittedRoles: [UserRole, ...UserRole[]]
): RequestHandler {
  return (request, _response, next) => {
    const authenticatedUser = request.authenticatedUser;

    if (!authenticatedUser) {
      return next(unauthorized());
    }

    if (!permittedRoles.includes(authenticatedUser.role)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN',
          'You do not have permission to access this resource',
        ),
      );
    }

    return next();
  };
}

export const currentUserHandler: RequestHandler = (request, response, next) => {
  const user = request.authenticatedUser;

  if (!user) {
    return next(unauthorized());
  }

  return response.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      authorId: user.authorId,
    },
  });
};
