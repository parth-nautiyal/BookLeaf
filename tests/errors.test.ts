import assert from 'node:assert/strict';
import { once } from 'node:events';
import express, { type Express } from 'express';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { z } from 'zod';
import { errorHandler } from '../src/middleware/errorHandler';
import { notFoundHandler } from '../src/middleware/notFound';
import { validateBody } from '../src/middleware/validate';
import app from '../src/app';

async function startServer(application: Express): Promise<{
  server: Server;
  baseUrl: string;
}> {
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

async function withTestApp<T>(
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const testApp = express();
  testApp.use(express.json({ limit: '100kb' }));
  testApp.post(
    '/validate',
    validateBody(z.object({ email: z.string().email() })),
    (_request, response) => response.json({ ok: true }),
  );
  testApp.post('/generic-error', (_request, _response, next) => {
    next(new Error('private implementation detail'));
  });
  testApp.use(notFoundHandler);
  testApp.use(errorHandler);

  const { server, baseUrl } = await startServer(testApp);

  try {
    return await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('validation failures return a structured 400 with field details', async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ field: 'email', message: 'Invalid email address' }],
      },
    });
  });
});

test('malformed JSON returns a structured 400', async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
  });
});

test('oversized JSON returns a structured 400', async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a'.repeat(110_000) }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the 100kb limit',
      },
    });
  });
});

test('unmatched routes return a structured 404', async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });
});

test('unexpected errors return a generic 500 without internal details', async () => {
  await withTestApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generic-error`, {
      method: 'POST',
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
    assert.equal(
      JSON.stringify(body).includes('private implementation detail'),
      false,
    );
  });
});

test('the existing health endpoint still reports MongoDB connection state', async () => {
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.ok(response.status === 200 || response.status === 503);
    assert.deepEqual(body, {
      status: response.status === 200 ? 'ok' : 'error',
      database: response.status === 200 ? 'connected' : 'disconnected',
    });
  } finally {
    server.close();
    await once(server, 'close');
  }
});
