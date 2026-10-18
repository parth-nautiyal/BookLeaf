import type { UserRole } from '../constants/user';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  authorId: string | null;
}
