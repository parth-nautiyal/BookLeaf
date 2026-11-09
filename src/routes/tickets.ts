import express from 'express';
import { errorCodes } from '../constants/errors';
import { errorMessages } from '../constants/errorMessages';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { Types } from 'mongoose';
import Author from '../models/Author';
import Book from '../models/Book';
import Ticket from '../models/Ticket';
import {
  createTicketSchema,
  type CreateTicketInput,
} from '../schemas/createTicket';

const router = express.Router();

router.get(
  '/:id',
  requireAuth,
  requireRole('author'),
  asyncHandler(async (request, response) => {
    const ticketId = request.params.id;
    if (!/^[a-f\d]{24}$/i.test(ticketId) || !Types.ObjectId.isValid(ticketId)) {
      throw new AppError(400, 'INVALID_TICKET_ID', 'Ticket ID is invalid');
    }

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

    const ticket = await Ticket.findOne({
      _id: ticketId,
      author: author._id,
    })
      .select(
        'subject description category priority status book messages createdAt updatedAt',
      )
      .populate<{ book: { _id: Types.ObjectId; title?: string } | null }>(
        'book',
        'title',
      )
      .lean();

    if (!ticket) {
      throw new AppError(
        404,
        errorCodes.ticketNotFound,
        errorMessages.ticketNotFound,
      );
    }

    return response.status(200).json({
      ticket: {
        id: ticket._id.toString(),
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        book: ticket.book
          ? {
              id: ticket.book._id.toString(),
              title: ticket.book.title ?? null,
            }
          : null,
        messages: ticket.messages
          .filter((message) => message.type === 'public_reply')
          .map((message) => ({
            senderRole: message.senderRole,
            content: message.content,
            createdAt: message.createdAt,
          })),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    });
  }),
);

router.get(
  '/',
  requireAuth,
  requireRole('author'),
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

    const tickets = await Ticket.find({ author: author._id })
      .select(
        'subject description category priority status book createdAt updatedAt',
      )
      .populate<{ book: { _id: Types.ObjectId; title?: string } | null }>(
        'book',
        'title',
      )
      .sort({ createdAt: -1 })
      .lean();

    return response.status(200).json({
      tickets: tickets.map((ticket) => ({
        id: ticket._id.toString(),
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        book: ticket.book
          ? {
              id: ticket.book._id.toString(),
              title: ticket.book.title ?? null,
            }
          : null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      })),
    });
  }),
);

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
