import express from 'express';
import { errorCodes } from '../constants/errors';
import { errorMessages } from '../constants/errorMessages';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import Author from '../models/Author';
import Book from '../models/Book';

const router = express.Router();

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

    const books = await Book.find({ author: author._id })
      .select(
        'title isbn genre publicationDate status mrp totalCopiesSold totalRoyaltyEarned royaltyPaid royaltyPending',
      )
      .lean();

    return response.status(200).json({
      books: books.map((book) => ({
        id: book._id.toString(),
        title: book.title,
        isbn: book.isbn,
        genre: book.genre,
        publicationDate: book.publicationDate,
        status: book.status,
        mrp: book.mrp,
        totalCopiesSold: book.totalCopiesSold,
        totalRoyaltyEarned: book.totalRoyaltyEarned,
        royaltyPaid: book.royaltyPaid,
        royaltyPending: book.royaltyPending,
      })),
    });
  }),
);

export default router;
