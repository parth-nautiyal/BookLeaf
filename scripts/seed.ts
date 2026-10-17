import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import Author from '../src/models/Author';
import Book from '../src/models/Book';
import User from '../src/models/User';
import {
  connectToDatabase,
  disconnectFromDatabase,
} from '../src/config/database';
import { seedFileSchema, type SeedFile } from '../src/schemas/seedFile';

interface SeedCredentials {
  demoPassword: string;
  adminEmail: string;
  adminPassword: string;
}

export async function parseSeedFile(filePath: string): Promise<SeedFile> {
  const rawData = await fs.readFile(filePath, 'utf8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawData);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in seed file ${filePath}: ${detail}`);
  }

  const result = seedFileSchema.safeParse(parsed);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid seed data in ${filePath}: ${details}`);
  }

  const authorIds = new Set<string>();
  const bookIds = new Set<string>();
  const isbns = new Set<string>();

  for (const author of result.data.authors) {
    if (authorIds.has(author.author_id)) {
      throw new Error(`Duplicate authorId in seed data: ${author.author_id}`);
    }
    authorIds.add(author.author_id);

    for (const book of author.books) {
      if (bookIds.has(book.book_id)) {
        throw new Error(`Duplicate bookId in seed data: ${book.book_id}`);
      }
      bookIds.add(book.book_id);

      if (isbns.has(book.isbn)) {
        throw new Error(`Duplicate ISBN in seed data: ${book.isbn}`);
      }
      isbns.add(book.isbn);
    }
  }

  return result.data;
}

export async function seedDatabase(
  data: SeedFile,
  credentials: SeedCredentials,
): Promise<void> {
  const authorEmails = data.authors.map((author) =>
    author.email.trim().toLowerCase(),
  );
  const adminEmail = credentials.adminEmail.trim().toLowerCase();

  if (new Set(authorEmails).size !== authorEmails.length) {
    throw new Error(
      'Author emails must be unique to seed one user per author.',
    );
  }

  if (authorEmails.includes(adminEmail)) {
    throw new Error('SEED_ADMIN_EMAIL must not match an author email.');
  }

  for (const author of data.authors) {
    for (const book of author.books) {
      if (
        book.royalty_paid + book.royalty_pending !==
        book.total_royalty_earned
      ) {
        console.warn(`WARNING: Royalty totals differ for ${book.book_id}.`);
      }
    }
  }

  const demoPasswordHash = await bcrypt.hash(credentials.demoPassword, 10);
  const adminPasswordHash = await bcrypt.hash(credentials.adminPassword, 10);

  await Author.init();
  await Book.init();
  await User.init();

  await Author.bulkWrite(
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
            joinedDate: author.joined_date,
          },
        },
        upsert: true,
      },
    })),
  );

  const authorRecords = await Author.find({
    authorId: { $in: data.authors.map((author) => author.author_id) },
  })
    .select({ authorId: 1 })
    .lean();
  const authorsById = new Map(
    authorRecords.map((author) => [author.authorId, author._id]),
  );

  const bookOperations = data.authors.flatMap((seedAuthor) => {
    const authorObjectId = authorsById.get(seedAuthor.author_id);

    if (!authorObjectId) {
      throw new Error(
        `Cannot seed books: author ${seedAuthor.author_id} was not found after the author upsert.`,
      );
    }

    return seedAuthor.books.map((seedBook) => ({
      updateOne: {
        filter: { bookId: seedBook.book_id },
        update: {
          $set: {
            bookId: seedBook.book_id,
            author: authorObjectId,
            title: seedBook.title,
            isbn: seedBook.isbn,
            genre: seedBook.genre,
            status: seedBook.status,
            publicationDate: seedBook.publication_date,
            mrp: seedBook.mrp,
            authorRoyaltyPerCopy: seedBook.author_royalty_per_copy,
            totalCopiesSold: seedBook.total_copies_sold,
            totalRoyaltyEarned: seedBook.total_royalty_earned,
            royaltyPaid: seedBook.royalty_paid,
            royaltyPending: seedBook.royalty_pending,
            lastRoyaltyPayoutDate: seedBook.last_royalty_payout_date,
            printPartner: seedBook.print_partner,
            availableOn: seedBook.available_on,
          },
        },
        upsert: true,
      },
    }));
  });

  await Book.bulkWrite(bookOperations);

  let usersInserted = 0;

  for (const seedAuthor of data.authors) {
    const authorObjectId = authorsById.get(seedAuthor.author_id);

    if (!authorObjectId) {
      throw new Error(
        `Cannot seed user: author ${seedAuthor.author_id} was not found after the author upsert.`,
      );
    }

    const email = seedAuthor.email.trim().toLowerCase();
    const result = await User.updateOne(
      { email },
      {
        $set: {
          email,
          passwordHash: demoPasswordHash,
          role: 'author',
          author: authorObjectId,
        },
      },
      { upsert: true },
    );
    usersInserted += result.upsertedCount;
  }

  const adminResult = await User.updateOne(
    { email: adminEmail },
    {
      $set: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: 'admin',
      },
    },
    { upsert: true },
  );
  usersInserted += adminResult.upsertedCount;

  const expectedBookCount = data.authors.reduce(
    (total, author) => total + author.books.length,
    0,
  );
  const authorCount = await Author.countDocuments();
  const bookCount = await Book.countDocuments();
  const userCount = await User.countDocuments();
  const seededUserCount = await User.countDocuments({
    email: { $in: [...authorEmails, adminEmail] },
  });

  console.info(
    `Seed counts: ${authorCount} authors, ${bookCount} books, ${userCount} users.`,
  );
  console.info(`User accounts inserted: ${usersInserted}.`);

  if (authorCount !== data.authors.length) {
    throw new Error(
      `Expected ${data.authors.length} authors after seeding, found ${authorCount}.`,
    );
  }

  if (bookCount !== expectedBookCount) {
    throw new Error(
      `Expected ${expectedBookCount} books after seeding, found ${bookCount}.`,
    );
  }

  if (seededUserCount !== authorEmails.length + 1) {
    throw new Error(
      `Expected ${authorEmails.length + 1} seeded users, found ${seededUserCount}.`,
    );
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`${name} is required to seed demo users.`);
  }

  return value;
}

async function main(): Promise<void> {
  let connected = false;

  try {
    if (
      process.env.NODE_ENV === 'production' &&
      !process.argv.includes('--force')
    ) {
      throw new Error(
        'Refusing to seed in production without the --force option.',
      );
    }

    const credentials: SeedCredentials = {
      demoPassword: requiredEnv('SEED_DEMO_PASSWORD'),
      adminEmail: requiredEnv('SEED_ADMIN_EMAIL'),
      adminPassword: requiredEnv('SEED_ADMIN_PASSWORD'),
    };
    const seedFilePath = path.resolve(
      process.env.SEED_FILE ??
        path.join(process.cwd(), 'data', 'bookleaf_sample_data.json'),
    );
    const data = await parseSeedFile(seedFilePath);
    const connection = await connectToDatabase();
    connected = true;

    console.info(`Target database: ${connection.name}`);
    await seedDatabase(data, credentials);
  } catch (error) {
    console.error('Unable to seed BookLeaf data:', error);
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await disconnectFromDatabase();
      } catch (error) {
        console.error('Unable to disconnect from MongoDB:', error);
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) {
  void main();
}
