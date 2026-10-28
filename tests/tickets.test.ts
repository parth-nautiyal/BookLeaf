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
import Ticket from '../src/models/Ticket';
import User from '../src/models/User';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bookleaf_tickets_test';
process.env.JWT_SECRET = 'ticket-create-test-secret-at-least-32-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const userId = new Types.ObjectId('507f1f77bcf86cd799439011');
const authorId = new Types.ObjectId('507f1f77bcf86cd799439012');
const bookId = new Types.ObjectId('507f1f77bcf86cd799439013');
const ticketId = new Types.ObjectId('507f1f77bcf86cd799439014');
const createdAt = new Date('2026-01-02T03:04:05.000Z');

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

function createAuthorToken(): string {
  return jwt.sign(
    { sub: userId.toString(), role: 'author' },
    getRuntimeConfig().jwtSecret,
    { algorithm: 'HS256' },
  );
}

function mockAuthorAuthentication(context: TestContext): void {
  context.mock.method(User, 'findById', () => ({
    select: async () => ({
      _id: userId,
      email: 'author@example.com',
      role: 'author',
      author: authorId,
    }),
  }));
  context.mock.method(Author, 'findById', () => ({
    select: () => ({
      lean: async () => ({ authorId: 'AUTH001' }),
    }),
  }));
  context.mock.method(Author, 'findOne', (filter: { authorId?: string }) => ({
    select: () => ({
      lean: async () =>
        filter.authorId === 'AUTH001' ? { _id: authorId } : null,
    }),
  }));
}

function mockTicketCreation(
  context: TestContext,
  book: { _id: Types.ObjectId } | null,
): {
  bookFilter: { _id?: string; author?: Types.ObjectId };
  savedTicket: {
    author: Types.ObjectId;
    book: Types.ObjectId | null;
    subject: string;
    description: string;
  } | null;
} {
  const bookFilter: { _id?: string; author?: Types.ObjectId } = {};
  let savedTicket: {
    author: Types.ObjectId;
    book: Types.ObjectId | null;
    subject: string;
    description: string;
  } | null = null;

  context.mock.method(Book, 'findOne', (filter: typeof bookFilter) => {
    Object.assign(bookFilter, filter);
    return {
      select: () => ({
        lean: async () =>
          filter.author?.toString() === authorId.toString() ? book : null,
      }),
    };
  });
  context.mock.method(
    Ticket,
    'create',
    async (data: {
      author: Types.ObjectId;
      book: Types.ObjectId | null;
      subject: string;
      description: string;
    }) => {
      savedTicket = data;
      return new Ticket({
        ...data,
        _id: ticketId,
        status: 'Open',
        category: null,
        priority: null,
        createdAt,
        updatedAt: createdAt,
      });
    },
  );

  return {
    bookFilter,
    get savedTicket() {
      return savedTicket;
    },
  };
}

async function postTicket(
  baseUrl: string,
  body: unknown,
  token = createAuthorToken(),
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      cookie: `bookleaf_auth=${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('POST /api/v1/tickets rejects unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: 'Royalty question',
        description: 'Please explain my royalty statement.',
      }),
    });

    assert.equal(response.status, 401);
  });
});

test('POST /api/v1/tickets creates a book-linked ticket for the authenticated author', async (context) => {
  mockAuthorAuthentication(context);
  const creation = mockTicketCreation(context, {
    _id: bookId,
  });

  await withServer(async (baseUrl) => {
    const response = await postTicket(baseUrl, {
      subject: 'Royalty question',
      description: 'Please explain my royalty statement.',
      bookId: bookId.toString(),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(creation.bookFilter, {
      _id: bookId.toString(),
      author: authorId,
    });
    assert.deepEqual(creation.savedTicket, {
      author: authorId,
      book: bookId,
      subject: 'Royalty question',
      description: 'Please explain my royalty statement.',
    });
    assert.deepEqual(body, {
      ticket: {
        id: ticketId.toString(),
        bookId: bookId.toString(),
        subject: 'Royalty question',
        description: 'Please explain my royalty statement.',
        category: null,
        priority: null,
        status: 'Open',
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      },
    });
  });
});

test('POST /api/v1/tickets creates a general ticket with book set to null', async (context) => {
  mockAuthorAuthentication(context);
  const creation = mockTicketCreation(context, null);

  await withServer(async (baseUrl) => {
    const response = await postTicket(baseUrl, {
      subject: 'Account question',
      description: 'I have a question about my account.',
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(creation.savedTicket, {
      author: authorId,
      book: null,
      subject: 'Account question',
      description: 'I have a question about my account.',
    });
    assert.equal(body.ticket.bookId, null);
    assert.equal(body.ticket.status, 'Open');
    assert.equal(body.ticket.category, null);
    assert.equal(body.ticket.priority, null);
  });
});

test('POST /api/v1/tickets rejects empty fields and invalid book IDs', async (context) => {
  mockAuthorAuthentication(context);
  mockTicketCreation(context, null);

  await withServer(async (baseUrl) => {
    const invalidBodyResponse = await postTicket(baseUrl, {
      subject: '   ',
      description: '',
    });
    const invalidIdResponse = await postTicket(baseUrl, {
      subject: 'Royalty question',
      description: 'Please explain my royalty statement.',
      bookId: 'not-an-object-id',
    });

    assert.equal(invalidBodyResponse.status, 400);
    assert.equal(
      (await invalidBodyResponse.json()).error.code,
      'VALIDATION_ERROR',
    );
    assert.equal(invalidIdResponse.status, 400);
    assert.equal(
      (await invalidIdResponse.json()).error.code,
      'VALIDATION_ERROR',
    );
  });
});

test('POST /api/v1/tickets rejects a book not owned by the authenticated author', async (context) => {
  mockAuthorAuthentication(context);
  const creation = mockTicketCreation(context, null);

  await withServer(async (baseUrl) => {
    const response = await postTicket(baseUrl, {
      subject: 'Book question',
      description: 'Please help with this book.',
      bookId: bookId.toString(),
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'BOOK_NOT_FOUND');
    assert.equal(creation.savedTicket, null);
  });
});

test('POST /api/v1/tickets does not allow client-supplied privileged fields', async (context) => {
  mockAuthorAuthentication(context);
  mockTicketCreation(context, null);

  await withServer(async (baseUrl) => {
    const response = await postTicket(baseUrl, {
      subject: 'Royalty question',
      description: 'Please explain my royalty statement.',
      author: authorId.toString(),
      status: 'Closed',
      category: 'General Inquiry',
      priority: 'Critical',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});
