export const userRoles = ['author', 'admin'] as const;

export type UserRole = (typeof userRoles)[number];
