# BookLeaf Author Support Portal — Backend Phase 1

This phase provides the Express server, MongoDB connection, author/book model,
sample-data seed command, and database-backed health check. It does not yet
include a frontend, authentication, tickets, AI features, or deployment setup.

## Requirements

- Node.js 20 or newer
- A MongoDB server you can connect to

## Local setup

From the project root:

```sh
npm install
cp .env.example .env
```

Edit `.env` and set `MONGODB_URI` to your MongoDB connection string. The
example points to a MongoDB server running locally.

The TypeScript backend keeps the same CommonJS Express + Mongoose structure but
adds a typed compile step and a TypeScript-aware development runner.

Seed the supplied records:

```sh
npm run seed
```

Start the API in development mode:

```sh
npm run dev
```

Type-check the project without emitting files:

```sh
npm run typecheck
```

Build the compiled output for production-style startup:

```sh
npm run build
npm start
```

The server connects to MongoDB before it starts listening. If the connection
fails or `MONGODB_URI` is missing, startup reports the error and exits with a
failure status.

## Verification

With MongoDB running and `.env` configured, run:

```sh
npm run seed
npm run seed
```

Both runs should report 10 authors and 18 nested books. The second run should
not create duplicate authors. The seed reads `FULLSTACK-SAMPLEDATA (1).json`
directly from the project root and does not rewrite or copy the source file.

In another terminal, start the API and check its health:

```sh
npm run dev
curl -i http://localhost:3000/health
```

When MongoDB is connected, the health endpoint returns HTTP 200 and
`{"status":"ok","database":"connected"}`. If the server is running but the
database is disconnected, it returns HTTP 503 and
`{"status":"error","database":"disconnected"}`.

## Seed behavior

The seed command parses and checks the supplied JSON, then replaces each
MongoDB author document selected by `author_id`, with `upsert` enabled. The
unique `author_id` index prevents multiple documents for the same author.
Re-running the command therefore updates those same records instead of
inserting duplicates. The author document and its nested books are taken
directly from the JSON; the model stores dates as strings and disables
generated IDs for nested books. MongoDB still adds its standard `_id` field to
each author document.

## Phase 1 API

- `GET /health` — reports whether the MongoDB connection is ready.
