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
const otherAuthorId = new Types.ObjectId('507f1f77bcf86cd799439015');
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

function createAdminToken(): string {
  return jwt.sign(
    { sub: userId.toString(), role: 'admin' },
    getRuntimeConfig().jwtSecret,
    { algorithm: 'HS256' },
  );
}

function mockAdminAuthentication(context: TestContext): void {
  context.mock.method(User, 'findById', () => ({
    select: async () => ({
      _id: userId,
      email: 'admin@example.com',
      role: 'admin',
      author: null,
    }),
  }));
}

interface ListedTicketFixture {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  book: { _id: Types.ObjectId; title: string; isbn: string } | null;
  subject: string;
  description: string;
  category: string | null;
  priority: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  assignedTo: Types.ObjectId;
  messages: { type: string; content: string }[];
  aiSuggestions: { draftResponse: string };
  __v: number;
}

interface TicketDetailFixture extends ListedTicketFixture {
  messages: {
    _id: Types.ObjectId;
    sender: Types.ObjectId;
    senderRole: 'author' | 'admin';
    type: 'public_reply' | 'internal_note';
    content: string;
    createdAt: Date;
  }[];
}

function createListedTicket(
  owner: Types.ObjectId,
  ticketCreatedAt: Date,
): ListedTicketFixture {
  return {
    _id: new Types.ObjectId(),
    author: owner,
    book: {
      _id: bookId,
      title: 'The Sample Book',
      isbn: '9780000000001',
    },
    subject: 'Royalty question',
    description: 'Please explain my royalty statement.',
    category: 'Royalty & Payments',
    priority: 'High',
    status: 'Open',
    createdAt: ticketCreatedAt,
    updatedAt: ticketCreatedAt,
    assignedTo: new Types.ObjectId(),
    messages: [
      { type: 'internal_note', content: 'Private admin-only information' },
    ],
    aiSuggestions: { draftResponse: 'Private AI draft' },
    __v: 0,
  };
}

function createTicketDetail(owner: Types.ObjectId): TicketDetailFixture {
  const ticket = createListedTicket(owner, createdAt);
  const sender = new Types.ObjectId();

  return {
    ...ticket,
    messages: [
      {
        _id: new Types.ObjectId(),
        sender,
        senderRole: 'admin',
        type: 'public_reply',
        content: 'We are checking your royalty statement.',
        createdAt,
      },
      {
        _id: new Types.ObjectId(),
        sender,
        senderRole: 'admin',
        type: 'internal_note',
        content: 'Private investigation notes.',
        createdAt,
      },
    ],
  };
}

function mockTicketListing(
  context: TestContext,
  candidates: ListedTicketFixture[],
): {
  filter: { author?: Types.ObjectId };
  selectedFields: () => string;
  populatedFields: () => [string, string] | undefined;
  sortOptions: () => Record<string, number>;
} {
  const filter: { author?: Types.ObjectId } = {};
  let selectedFields = '';
  let populatedFields: [string, string] | undefined;
  let sortOptions: Record<string, number> = {};

  context.mock.method(Ticket, 'find', (query: typeof filter) => {
    Object.assign(filter, query);
    return {
      select: (fields: string) => {
        selectedFields = fields;
        return {
          populate: (path: string, fieldsToPopulate: string) => {
            populatedFields = [path, fieldsToPopulate];
            return {
              sort: (options: Record<string, number>) => {
                sortOptions = options;
                return {
                  lean: async () =>
                    candidates
                      .filter(
                        (ticket) =>
                          ticket.author.toString() === query.author?.toString(),
                      )
                      .sort(
                        (left, right) =>
                          right.createdAt.getTime() - left.createdAt.getTime(),
                      ),
                };
              },
            };
          },
        };
      },
    };
  });

  return {
    filter,
    selectedFields: () => selectedFields,
    populatedFields: () => populatedFields,
    sortOptions: () => sortOptions,
  };
}

function mockTicketDetails(
  context: TestContext,
  ticket: TicketDetailFixture | null,
): {
  filter: { _id?: string; author?: Types.ObjectId };
  selectedFields: () => string;
  populatedFields: () => [string, string] | undefined;
} {
  const filter: { _id?: string; author?: Types.ObjectId } = {};
  let selectedFields = '';
  let populatedFields: [string, string] | undefined;

  context.mock.method(Ticket, 'findOne', (query: typeof filter) => {
    Object.assign(filter, query);
    return {
      select: (fields: string) => {
        selectedFields = fields;
        return {
          populate: (path: string, fieldsToPopulate: string) => {
            populatedFields = [path, fieldsToPopulate];
            return {
              lean: async () =>
                ticket &&
                ticket._id.toString() === query._id &&
                ticket.author.toString() === query.author?.toString()
                  ? ticket
                  : null,
            };
          },
        };
      },
    };
  });

  return {
    filter,
    selectedFields: () => selectedFields,
    populatedFields: () => populatedFields,
  };
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

async function getTickets(
  baseUrl: string,
  token?: string,
  query = '',
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/tickets${query}`, {
    headers: token ? { cookie: `bookleaf_auth=${token}` } : {},
  });
}

async function getTicket(
  baseUrl: string,
  id: string,
  token?: string,
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/tickets/${id}`, {
    headers: token ? { cookie: `bookleaf_auth=${token}` } : {},
  });
}

test('GET /api/v1/tickets/:id rejects unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const response = await getTicket(baseUrl, ticketId.toString());
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });
});

test('GET /api/v1/tickets/:id denies authenticated non-authors', async (context) => {
  mockAdminAuthentication(context);

  await withServer(async (baseUrl) => {
    const response = await getTicket(
      baseUrl,
      ticketId.toString(),
      createAdminToken(),
    );
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

test('GET /api/v1/tickets/:id returns owned ticket details and only author-visible fields', async (context) => {
  mockAuthorAuthentication(context);
  const ticket = createTicketDetail(authorId);
  const details = mockTicketDetails(context, ticket);

  await withServer(async (baseUrl) => {
    const response = await getTicket(
      baseUrl,
      ticket._id.toString(),
      createAuthorToken(),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(details.filter, {
      _id: ticket._id.toString(),
      author: authorId,
    });
    assert.equal(
      details.selectedFields(),
      'subject description category priority status book messages createdAt updatedAt',
    );
    assert.deepEqual(details.populatedFields(), ['book', 'title']);
    assert.deepEqual(body, {
      ticket: {
        id: ticket._id.toString(),
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        book: {
          id: bookId.toString(),
          title: 'The Sample Book',
        },
        messages: [
          {
            senderRole: 'admin',
            content: 'We are checking your royalty statement.',
            createdAt: createdAt.toISOString(),
          },
        ],
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      },
    });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('internal_note'), false);
    assert.equal(serialized.includes('Private investigation notes.'), false);
    assert.equal(serialized.includes('Private AI draft'), false);
    assert.equal(serialized.includes('assignedTo'), false);
    assert.equal(serialized.includes('isbn'), false);
    assert.equal(serialized.includes('__v'), false);
    assert.equal(
      serialized.includes(ticket.messages[0].sender.toString()),
      false,
    );
  });
});

test('GET /api/v1/tickets/:id hides tickets belonging to another author', async (context) => {
  mockAuthorAuthentication(context);
  const foreignTicket = createTicketDetail(otherAuthorId);
  const details = mockTicketDetails(context, foreignTicket);

  await withServer(async (baseUrl) => {
    const response = await getTicket(
      baseUrl,
      foreignTicket._id.toString(),
      createAuthorToken(),
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      error: {
        code: 'TICKET_NOT_FOUND',
        message: 'Ticket not found',
      },
    });
    assert.deepEqual(details.filter, {
      _id: foreignTicket._id.toString(),
      author: authorId,
    });
  });
});

test('GET /api/v1/tickets/:id returns not found for a nonexistent ticket', async (context) => {
  mockAuthorAuthentication(context);
  mockTicketDetails(context, null);

  await withServer(async (baseUrl) => {
    const response = await getTicket(
      baseUrl,
      ticketId.toString(),
      createAuthorToken(),
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body.error, {
      code: 'TICKET_NOT_FOUND',
      message: 'Ticket not found',
    });
  });
});

test('GET /api/v1/tickets/:id rejects an invalid ticket ID', async (context) => {
  mockAuthorAuthentication(context);

  await withServer(async (baseUrl) => {
    const response = await getTicket(
      baseUrl,
      'not-an-object-id',
      createAuthorToken(),
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_TICKET_ID');
  });
});

test('GET /api/v1/tickets rejects unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const response = await getTickets(baseUrl);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });
});

test('GET /api/v1/tickets denies authenticated non-authors', async (context) => {
  mockAdminAuthentication(context);

  await withServer(async (baseUrl) => {
    const response = await getTickets(baseUrl, createAdminToken());
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

test('GET /api/v1/tickets returns only the authenticated author tickets, newest first, with safe fields', async (context) => {
  mockAuthorAuthentication(context);
  const olderTicket = createListedTicket(
    authorId,
    new Date('2026-01-01T03:04:05.000Z'),
  );
  const newerTicket = createListedTicket(
    authorId,
    new Date('2026-01-03T03:04:05.000Z'),
  );
  const otherAuthorsTicket = createListedTicket(
    otherAuthorId,
    new Date('2026-01-04T03:04:05.000Z'),
  );
  const listing = mockTicketListing(context, [
    olderTicket,
    otherAuthorsTicket,
    newerTicket,
  ]);

  await withServer(async (baseUrl) => {
    const response = await getTickets(
      baseUrl,
      createAuthorToken(),
      `?author=${otherAuthorId.toString()}`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(listing.filter, { author: authorId });
    assert.equal(
      listing.selectedFields(),
      'subject description category priority status book createdAt updatedAt',
    );
    assert.deepEqual(listing.populatedFields(), ['book', 'title']);
    assert.deepEqual(listing.sortOptions(), { createdAt: -1 });
    assert.deepEqual(body, {
      tickets: [newerTicket, olderTicket].map((ticket) => ({
        id: ticket._id.toString(),
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        book: {
          id: bookId.toString(),
          title: 'The Sample Book',
        },
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
    });
    assert.equal(JSON.stringify(body).includes('internal_note'), false);
    assert.equal(
      JSON.stringify(body).includes('Private admin-only information'),
      false,
    );
    assert.equal(JSON.stringify(body).includes('Private AI draft'), false);
    assert.equal(JSON.stringify(body).includes('assignedTo'), false);
    assert.equal(JSON.stringify(body).includes('__v'), false);
  });
});

test('GET /api/v1/tickets returns an empty list when the author has no tickets', async (context) => {
  mockAuthorAuthentication(context);
  mockTicketListing(context, []);

  await withServer(async (baseUrl) => {
    const response = await getTickets(baseUrl, createAuthorToken());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { tickets: [] });
  });
});

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
