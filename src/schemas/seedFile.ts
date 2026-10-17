import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const seedBookSchema = z
  .object({
    book_id: z.string(),
    title: z.string(),
    isbn: z.string(),
    genre: z.string(),
    publication_date: dateSchema.nullable(),
    status: z.string(),
    mrp: z.number().nonnegative().nullable(),
    author_royalty_per_copy: z.number().nonnegative().nullable(),
    total_copies_sold: z.number().nonnegative(),
    total_royalty_earned: z.number().nonnegative(),
    royalty_paid: z.number().nonnegative(),
    royalty_pending: z.number().nonnegative(),
    last_royalty_payout_date: dateSchema.nullable(),
    print_partner: z.string().nullable(),
    available_on: z.array(z.string()),
  })
  .strict();

export const seedAuthorSchema = z
  .object({
    author_id: z.string(),
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    city: z.string(),
    joined_date: dateSchema,
    books: z.array(seedBookSchema),
  })
  .strict();

export const seedFileSchema = z
  .object({
    authors: z.array(seedAuthorSchema),
  })
  .strict();

export type SeedBook = z.infer<typeof seedBookSchema>;
export type SeedAuthor = z.infer<typeof seedAuthorSchema>;
export type SeedFile = z.infer<typeof seedFileSchema>;
