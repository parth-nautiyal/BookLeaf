import bcrypt from 'bcryptjs';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { AUTH_COOKIE_NAME, JWT_ALGORITHM } from '../constants/auth';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { getRuntimeConfig } from '../config/env';
import User from '../models/User';
import { loginSchema, type LoginInput } from '../schemas/auth';
import type { AuthenticatedUser } from '../types/authenticatedUser';

const DUMMY_PASSWORD_HASH =
  '$2b$10$a86qayl5M1Ld2z5HAuFsler3quo2tqcz0xcsuWW.cX3K.b93eLO0.';

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
      new AppError(401, 'UNAUTHENTICATED', 'Authentication is required'),
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

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) =>
    response.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again later.',
      },
    }),
});

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
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
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
