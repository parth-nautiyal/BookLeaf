import express from 'express';
import { errorCodes } from '../constants/errors';
import { errorMessages } from '../constants/errorMessages';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import Author from '../models/Author';
import Book from '../models/Book';
import Ticket from '../models/Ticket';
import {
  createTicketSchema,
  type CreateTicketInput,
} from '../schemas/createTicket';

const router = express.Router();

router.post(
  '/',
  requireAuth,
  requireRole('author'),
  validateBody(createTicketSchema),
  asyncHandler(async (request, response) => {
    const authenticatedUser = request.authenticatedUser;

    if (!authenticatedUser?.authorId) {
      throw new AppError(
        404,
        errorCodes.authorNotFound,
        errorMessages.authorNotFound,
      );
    }

    const author = await Author.findOne({
      authorId: authenticatedUser.authorId,
    })
      .select('_id')
      .lean();

    if (!author) {
      throw new AppError(
        404,
        errorCodes.authorNotFound,
        errorMessages.authorNotFound,
      );
    }

    const { subject, description, bookId } = request.body as CreateTicketInput;
    let book = null;

    if (bookId) {
      book = await Book.findOne({
        _id: bookId,
        author: author._id,
      })
        .select('_id')
        .lean();

      if (!book) {
        throw new AppError(404, errorCodes.bookNotFound, 'Book not found');
      }
    }

    const ticket = await Ticket.create({
      author: author._id,
      book: book?._id ?? null,
      subject,
      description,
    });

    return response.status(201).json({
      ticket: {
        id: ticket._id.toString(),
        bookId: ticket.book?.toString() ?? null,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    });
  }),
);

export default router;
