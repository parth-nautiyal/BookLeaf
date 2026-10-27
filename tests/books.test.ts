import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import test, { type TestContext } from 'node:test';
import app from '../src/app';
import { getRuntimeConfig } from '../src/config/env';
import Author from '../src/models/Author';
import Book from '../src/models/Book';
import User from '../src/models/User';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bookleaf_books_test';
process.env.JWT_SECRET = 'books-endpoint-test-secret-at-least-32-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const userObjectId = new Types.ObjectId('507f1f77bcf86cd799439011');
const authorObjectId = new Types.ObjectId('507f1f77bcf86cd799439012');
const otherAuthorObjectId = new Types.ObjectId('507f1f77bcf86cd799439013');

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function createBook(
  author: Types.ObjectId,
  values: Partial<{
    title: string;
    status: string;
    publicationDate: string | null;
    mrp: number | null;
    totalCopiesSold: number;
    totalRoyaltyEarned: number;
    royaltyPaid: number;
    royaltyPending: number;
  }> = {},
) {
  return {
    _id: new Types.ObjectId(),
    author,
    title: 'The Sample Book',
    isbn: '9780000000001',
    genre: 'Fiction',
    publicationDate: '2025-01-01',
    status: 'Published',
    mrp: 399,
    totalCopiesSold: 12,
    totalRoyaltyEarned: 1200,
    royaltyPaid: 800,
    royaltyPending: 400,
    __v: 0,
    ...values,
  };
}

function mockAuthenticatedAuthor(
  context: TestContext,
  books: ReturnType<typeof createBook>[],
): {
  authorFilter: { authorId?: string };
  bookFilter: { author?: Types.ObjectId };
} {
  const authorFilter: { authorId?: string } = {};
  const bookFilter: { author?: Types.ObjectId } = {};
  const user = {
    _id: userObjectId,
    email: 'author@example.com',
    role: 'author',
    author: authorObjectId,
  };
  const authorQuery = (authorRecord: { _id: Types.ObjectId } | null) => ({
    select: () => ({
      lean: async () => authorRecord,
    }),
  });

  context.mock.method(User, 'findById', () => ({
    select: async () => user,
  }));
  context.mock.method(Author, 'findById', () => ({
    select: () => ({
      lean: async () => ({ authorId: 'AUTH001' }),
    }),
  }));
  context.mock.method(Author, 'findOne', (filter: { authorId?: string }) => {
    Object.assign(authorFilter, filter);
    return authorQuery({ _id: authorObjectId });
  });
  context.mock.method(Book, 'find', (filter: { author?: Types.ObjectId }) => {
    Object.assign(bookFilter, filter);
    return {
      select: () => ({
        lean: async () =>
          books.filter(
            (book) => book.author.toString() === filter.author?.toString(),
          ),
      }),
    };
  });

  return { authorFilter, bookFilter };
}

async function getBooks(baseUrl: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/books`, {
    headers: token ? { cookie: `bookleaf_auth=${token}` } : {},
  });
}

function createAuthorToken(): string {
  return jwt.sign(
    { sub: userObjectId.toString(), role: 'author' },
    getRuntimeConfig().jwtSecret,
    { algorithm: 'HS256' },
  );
}

test('GET /api/v1/books rejects an unauthenticated request', async () => {
  await withServer(async (baseUrl) => {
    const response = await getBooks(baseUrl);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });
});

test('GET /api/v1/books returns only books owned by the authenticated author', async (context) => {
  const ownedBook = createBook(authorObjectId);
  const otherAuthorsBook = createBook(otherAuthorObjectId, {
    title: 'Another Author Book',
  });
  const { authorFilter, bookFilter } = mockAuthenticatedAuthor(context, [
    ownedBook,
    otherAuthorsBook,
  ]);

  await withServer(async (baseUrl) => {
    const response = await getBooks(baseUrl, createAuthorToken());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(authorFilter, { authorId: 'AUTH001' });
    assert.deepEqual(bookFilter.author, authorObjectId);
    assert.deepEqual(
      body.books.map((book: { id: string }) => book.id),
      [ownedBook._id.toString()],
    );
  });
});

test('GET /api/v1/books includes books that are still in production', async (context) => {
  const productionBook = createBook(authorObjectId, {
    status: 'In Production',
  });
  mockAuthenticatedAuthor(context, [productionBook]);

  await withServer(async (baseUrl) => {
    const response = await getBooks(baseUrl, createAuthorToken());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.books.length, 1);
    assert.equal(body.books[0].status, 'In Production');
  });
});

test('GET /api/v1/books returns an empty array when the author has no books', async (context) => {
  mockAuthenticatedAuthor(context, []);

  await withServer(async (baseUrl) => {
    const response = await getBooks(baseUrl, createAuthorToken());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { books: [] });
  });
});

test('GET /api/v1/books returns My Books fields and an API-friendly id', async (context) => {
  const book = createBook(authorObjectId, {
    publicationDate: null,
    mrp: null,
  });
  mockAuthenticatedAuthor(context, [book]);

  await withServer(async (baseUrl) => {
    const response = await getBooks(baseUrl, createAuthorToken());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      books: [
        {
          id: book._id.toString(),
          title: book.title,
          isbn: book.isbn,
          genre: book.genre,
          publicationDate: null,
          status: book.status,
          mrp: null,
          totalCopiesSold: book.totalCopiesSold,
          totalRoyaltyEarned: book.totalRoyaltyEarned,
          royaltyPaid: book.royaltyPaid,
          royaltyPending: book.royaltyPending,
        },
      ],
    });
  });
});

test('GET /api/books is not registered as an unversioned business route', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/books`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
