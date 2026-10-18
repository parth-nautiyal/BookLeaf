import type { AuthenticatedUser } from './authenticatedUser';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

export {};
