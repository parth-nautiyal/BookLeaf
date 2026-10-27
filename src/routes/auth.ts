import bcrypt from 'bcryptjs';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import {
  AUTH_COOKIE_NAME,
  DUMMY_PASSWORD_HASH,
  JWT_ALGORITHM,
} from '../constants/auth';
import { errorCodes } from '../constants/errors';
import { errorMessages } from '../constants/errorMessages';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import loginRateLimiter from '../middleware/loginRateLimiter';
import { validateBody } from '../middleware/validate';
import { getRuntimeConfig } from '../config/env';
import User from '../models/User';
import { loginSchema, type LoginInput } from '../schemas/auth';
import type { AuthenticatedUser } from '../types/authenticatedUser';

const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

const router = express.Router();

export const currentUserHandler: RequestHandler = (request, response, next) => {
  const user: AuthenticatedUser | undefined = request.authenticatedUser;

  if (!user) {
    return next(
      new AppError(
        401,
        errorCodes.unauthenticated,
        'Authentication is required',
      ),
    );
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

router.post(
  '/login',
  loginRateLimiter,
  validateBody(loginSchema),
  asyncHandler(async (request, response) => {
    const { email, password } = request.body as LoginInput;
    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new AppError(
        401,
        errorCodes.invalidCredentials,
        errorMessages.invalidCredentials,
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError(
        401,
        errorCodes.invalidCredentials,
        errorMessages.invalidCredentials,
      );
    }

    const config = getRuntimeConfig();
    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      config.jwtSecret,
      {
        algorithm: JWT_ALGORITHM,
        expiresIn: config.jwtExpiresInMs / 1000,
      },
    );

    response.cookie(AUTH_COOKIE_NAME, token, {
      ...authCookieOptions,
      maxAge: config.jwtExpiresInMs,
    });

    return response.status(200).json({ message: 'Logged in successfully' });
  }),
);

router.post('/logout', (_request, response) => {
  response.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
  return response.status(200).json({ message: 'Logged out successfully' });
});

router.get('/me', requireAuth, currentUserHandler);

export default router;
