import { z } from 'zod';

export const createTicketSchema = z
  .object({
    subject: z.string().trim().min(1),
    description: z.string().trim().min(1),
    bookId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
