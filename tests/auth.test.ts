import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import test from 'node:test';
import app from '../src/app';
import { getRuntimeConfig } from '../src/config/env';
import { errorHandler } from '../src/middleware/errorHandler';
import {
  currentUserHandler,
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from '../src/middleware/auth';
import { loginSchema } from '../src/schemas/auth';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bookleaf_auth_test';
process.env.JWT_SECRET = 'substep4-test-secret-that-is-at-least-32-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

async function startServer(
  application: Express = app,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(application);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function withServer<T>(
  application: Express,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const { server, baseUrl } = await startServer(application);

  try {
    return await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function createRoleTestApp(
  identity?: AuthenticatedUser,
  attachIdentity = true,
): Express {
  const testApp = express();

  testApp.get(
    '/role-check',
    (request, _response, next) => {
      if (attachIdentity && identity) {
        request.authenticatedUser = identity;
      }
      next();
    },
    requireRole('admin'),
    (_request, response) => response.status(204).end(),
  );
  testApp.use(errorHandler);

  return testApp;
}

test('login schema trims and lowercases email addresses', () => {
  assert.deepEqual(
    loginSchema.parse({
      email: '  Author@Example.com ',
      password: 'password',
    }),
    { email: 'author@example.com', password: 'password' },
  );
});

test('invalid login input is rejected before database access', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'password' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.equal(body.error.details[0].field, 'email');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('logout clears the authentication cookie and returns success', async () => {
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
    });
    const cookie = response.headers.get('set-cookie');

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      message: 'Logged out successfully',
    });
    assert.ok(cookie);
    assert.ok(cookie.startsWith('bookleaf_auth=;'));
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });
});

test('GET /api/auth/me rejects a missing authentication cookie with 401', async () => {
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });
});

test('requireAuth rejects malformed JWTs without querying the database', async () => {
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: 'bookleaf_auth=not-a-jwt' },
    });

    assert.equal(response.status, 401);
  });
});

test('requireAuth rejects JWTs with an invalid signature without querying the database', async () => {
  const token = jwt.sign(
    { sub: '507f1f77bcf86cd799439011', role: 'admin' },
    'incorrect-test-signing-secret',
    { algorithm: 'HS256' },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: `bookleaf_auth=${token}` },
    });

    assert.equal(response.status, 401);
  });
});

test('requireAuth rejects expired JWTs without querying the database', async () => {
  const token = jwt.sign(
    { sub: '507f1f77bcf86cd799439011', role: 'admin' },
    getRuntimeConfig().jwtSecret,
    { algorithm: 'HS256', expiresIn: -1 },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: `bookleaf_auth=${token}` },
    });

    assert.equal(response.status, 401);
  });
});

test('requireAuth rejects a signed token with an invalid subject before querying', async () => {
  const token = jwt.sign(
    { sub: 'not-a-user-id', role: 'admin' },
    getRuntimeConfig().jwtSecret,
    { algorithm: 'HS256' },
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: `bookleaf_auth=${token}` },
    });

    assert.equal(response.status, 401);
  });
});

test('requireRole returns 401 when there is no authenticated identity', async () => {
  await withServer(createRoleTestApp(undefined, false), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/role-check`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });
});

test('requireRole returns 403 when the authenticated role is not permitted', async () => {
  const authorIdentity: AuthenticatedUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'author@example.com',
    role: 'author',
    authorId: 'AUTH001',
  };

  await withServer(createRoleTestApp(authorIdentity), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/role-check`);
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

test('requireRole allows an authenticated identity with a permitted role', async () => {
  const adminIdentity: AuthenticatedUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'admin@example.com',
    role: 'admin',
    authorId: null,
  };

  await withServer(createRoleTestApp(adminIdentity), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/role-check`);

    assert.equal(response.status, 204);
  });
});

test('GET /me handler returns only the safe authenticated identity', async () => {
  const identity: AuthenticatedUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'author@example.com',
    role: 'author',
    authorId: 'AUTH001',
  };
  const testApp = express();
  testApp.get(
    '/me-response',
    (request, _response, next) => {
      request.authenticatedUser = identity;
      next();
    },
    currentUserHandler,
  );

  await withServer(testApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/me-response`);
    const body = await response.json();
    const serializedBody = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      user: {
        id: identity.id,
        email: identity.email,
        role: identity.role,
        authorId: identity.authorId,
      },
    });
    assert.equal(serializedBody.includes('passwordHash'), false);
    assert.equal(serializedBody.includes('jwt'), false);
  });
});

test('GET /me handler returns null authorId for an admin identity', async () => {
  const identity: AuthenticatedUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'admin@example.com',
    role: 'admin',
    authorId: null,
  };
  const testApp = express();
  testApp.get(
    '/me-response',
    (request, _response, next) => {
      request.authenticatedUser = identity;
      next();
    },
    currentUserHandler,
  );

  await withServer(testApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/me-response`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: {
        id: identity.id,
        email: identity.email,
        role: identity.role,
        authorId: null,
      },
    });
  });
});
