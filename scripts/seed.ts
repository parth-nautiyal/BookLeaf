import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import Author from '../src/models/Author';
import Book from '../src/models/Book';
import {
  connectToDatabase,
  disconnectFromDatabase
} from '../src/config/database';
import type { AuthorData, BookData } from '../src/types/author';

const seedFilePath = path.resolve(
  process.env.SEED_FILE ?? path.join(process.cwd(), 'data', 'bookleaf_sample_data.json')
);

type SeedData = {
  authors: AuthorData[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'number';
}

function isSeedBook(value: unknown): value is BookData {
  return (
    isRecord(value) &&
    typeof value.book_id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.isbn === 'string' &&
    typeof value.genre === 'string' &&
    isOptionalString(value.publication_date) &&
    typeof value.status === 'string' &&
    isOptionalNumber(value.mrp) &&
    isOptionalNumber(value.author_royalty_per_copy) &&
    typeof value.total_copies_sold === 'number' &&
    typeof value.total_royalty_earned === 'number' &&
    typeof value.royalty_paid === 'number' &&
    typeof value.royalty_pending === 'number' &&
    isOptionalString(value.last_royalty_payout_date) &&
    isOptionalString(value.print_partner) &&
    Array.isArray(value.available_on) &&
    value.available_on.every((item: unknown) => typeof item === 'string')
  );
}

function isSeedAuthor(value: unknown): value is AuthorData {
  return (
    isRecord(value) &&
    typeof value.author_id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    typeof value.phone === 'string' &&
    typeof value.city === 'string' &&
    typeof value.joined_date === 'string' &&
    Array.isArray(value.books) &&
    value.books.every(isSeedBook)
  );
}

function validateSeedData(data: unknown): SeedData {
  if (!isRecord(data) || !Array.isArray(data.authors)) {
    throw new Error('The sample JSON must contain an authors array.');
  }

  const authorIds = new Set<string>();
  const bookIds = new Set<string>();
  const authors: AuthorData[] = [];
  const candidates: unknown[] = data.authors;

  for (const candidate of candidates) {
    if (!isSeedAuthor(candidate)) {
      throw new Error('Each author must have an author_id and a books array.');
    }

    if (authorIds.has(candidate.author_id)) {
      throw new Error(`Duplicate author_id in sample data: ${candidate.author_id}`);
    }
    authorIds.add(candidate.author_id);
    authors.push(candidate);

    for (const book of candidate.books) {
      if (bookIds.has(book.book_id)) {
        throw new Error(`Duplicate book_id in sample data: ${book.book_id}`);
      }
      bookIds.add(book.book_id);
    }
  }

  return { authors };
}

async function seedAuthors(): Promise<void> {
  const rawData = await fs.readFile(seedFilePath, 'utf8');
  const parsed: unknown = JSON.parse(rawData);
  const data = validateSeedData(parsed);
  const authorCount = data.authors.length;
  const bookCount = data.authors.reduce((total, author) => total + author.books.length, 0);

  await connectToDatabase();
  await Author.init();

  const authorResult = await Author.bulkWrite(
    data.authors.map((author) => ({
      updateOne: {
        filter: { authorId: author.author_id },
        update: {
          $set: {
            authorId: author.author_id,
            name: author.name,
            email: author.email,
            phone: author.phone,
            city: author.city,
            joinedDate: author.joined_date
          }
        },
        upsert: true
      }
    }))
  );

  await Book.init();
  const authorRecords = await Author.find({
    authorId: { $in: data.authors.map((author) => author.author_id) }
  })
    .select({ authorId: 1 })
    .lean();
  const authorsById = new Map(
    authorRecords.map((author) => [author.authorId, author._id])
  );

  const bookResult = await Book.bulkWrite(
    data.authors.flatMap((author) => {
      const authorObjectId = authorsById.get(author.author_id);

      if (!authorObjectId) {
        throw new Error(`Unable to find the seeded author ${author.author_id}.`);
      }

      return author.books.map((book) => ({
        updateOne: {
          filter: { bookId: book.book_id },
          update: {
            $set: {
              bookId: book.book_id,
              author: authorObjectId,
              title: book.title,
              isbn: book.isbn,
              genre: book.genre,
              status: book.status,
              publicationDate: book.publication_date,
              mrp: book.mrp,
              authorRoyaltyPerCopy: book.author_royalty_per_copy,
              totalCopiesSold: book.total_copies_sold,
              totalRoyaltyEarned: book.total_royalty_earned,
              royaltyPaid: book.royalty_paid,
              royaltyPending: book.royalty_pending,
              lastRoyaltyPayoutDate: book.last_royalty_payout_date,
              printPartner: book.print_partner,
              availableOn: book.available_on
            }
          },
          upsert: true
        }
      }));
    })
  );

  const storedAuthorCount = await Author.countDocuments();

  if (storedAuthorCount !== authorCount) {
    throw new Error(
      `Expected ${authorCount} author records after seeding, found ${storedAuthorCount}.`
    );
  }

  const storedBookCount = await Book.countDocuments({
    bookId: { $in: data.authors.flatMap((author) => author.books.map((book) => book.book_id)) }
  });

  if (storedBookCount !== bookCount) {
    throw new Error(
      `Expected ${bookCount} book records after seeding, found ${storedBookCount}.`
    );
  }

  console.info(
    `Seed complete: ${authorCount} authors and ${bookCount} books.`
  );
  console.info(
    `Author writes: ${authorResult.upsertedCount} inserted, ${authorResult.modifiedCount} replaced.`
  );
  console.info(
    `Book writes: ${bookResult.upsertedCount} inserted, ${bookResult.modifiedCount} replaced.`
  );
}

seedAuthors()
  .catch((error: unknown) => {
    console.error('Unable to seed author data:', error);
    process.exitCode = 1;
  }  )
  .finally(async () => {
    await disconnectFromDatabase();
  });
