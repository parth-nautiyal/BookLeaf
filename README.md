# BookLeaf Author Support Portal — Backend Foundation

This TypeScript backend provides an Express server, MongoDB connection,
Author/Book/User/Ticket models, authentication routes, author book and ticket
creation endpoints, a Zod-validated sample-data seed script, tests, and a
database-backed health check. Ticket listing, details, conversations, AI
features, and a frontend are not implemented yet.

## Prerequisites

- Node.js 20 or newer
- MongoDB running locally

The default MongoDB URI in `.env.example` uses a local database named
`bookleaf_portal`.

## Install and configure

From the project root:

```sh
npm install
cp .env.example .env
```

Edit `.env` for your local MongoDB connection and demo-account settings. The
seed command requires:

- `MONGODB_URI` — connection string for the development database
- `SEED_DEMO_PASSWORD` — shared password for all seeded author accounts
- `SEED_ADMIN_EMAIL` — email address for the seeded admin account
- `SEED_ADMIN_PASSWORD` — password for the seeded admin account

Use private development values in `.env`. Do not put real passwords in
`.env.example`, source code, or documentation. The seed script hashes
passwords with bcryptjs before storing them.

## Seed the sample data

With MongoDB running and `.env` configured, run:

```sh
npm run seed
```

The script reads `data/bookleaf_sample_data.json` by default. Set `SEED_FILE` in
`.env` to use a different file. The script prints the target database name,
then upserts authors, books, and users. For the supplied data it verifies 10
authors and 18 books and reports the user count. It does not delete documents
or write to collections other than authors, books, and users.

The seed refuses to run when `NODE_ENV=production` unless `--force` is passed.
Only force a production seed after deliberately verifying the target database:

```sh
npm run seed -- --force
```

Seeding is idempotent for matching author, book, and user records. Each run
updates their records; in particular, it hashes and sets the current
`SEED_DEMO_PASSWORD` for all author accounts and `SEED_ADMIN_PASSWORD` for the
admin account, so re-running the seed resets those demo passwords to the
current environment values.

## Test, then start the server

Run the seed parser tests. They use the sample file and temporary malformed
files and do not connect to MongoDB:

```sh
npm test
```

Start the API in development mode:

```sh
npm run dev
```

The server connects to MongoDB before listening. If `MONGODB_URI` is missing or
the connection fails, startup reports an error and exits with a failure status.

Check the health endpoint while the server is running:

```sh
curl -i http://localhost:3000/health
```

When MongoDB is connected, it returns HTTP 200 and
`{"status":"ok","database":"connected"}`. If the server is running while the
database is disconnected, it returns HTTP 503 and
`{"status":"error","database":"disconnected"}`.

## Authentication endpoints

- `POST /api/v1/auth/login` accepts an email and password. On success, it sets
  the JWT in the `bookleaf_auth` HTTP-only cookie; the token is not returned in
  the response body.
- `POST /api/v1/auth/logout` clears that cookie.
- `GET /api/v1/auth/me` returns the authenticated user's safe identity fields
  and requires a valid authentication cookie.

Business API routes use the `/api/v1/` prefix. The unversioned `/api/auth/`
paths are no longer supported; `/health` remains an unversioned operational
health check.

## Author books endpoint

- `GET /api/v1/books` requires an authenticated author and returns that
  author's books, including books still in production. Book ownership is
  determined on the server from the authenticated account; the request cannot
  select another author.
- Each returned book includes an API-friendly `id` and the My Books fields:
  title, ISBN, genre, publication date, status, MRP, copies sold, and royalty
  totals.

## Create an author ticket

- `POST /api/v1/tickets` requires an authenticated author.
- Send `subject` and `description`; optionally include `bookId`, the API `id`
  of one of the authenticated author's books. Omit `bookId` for a General /
  Account Level ticket.
- The server derives the author from the authenticated account and verifies
  that a selected book belongs to that author. Client-supplied identity,
  status, category, priority, or other extra fields are rejected.
- A successful request returns HTTP `201` with a `ticket` object containing its
  `id`, `bookId` (or `null`), subject, description, status, nullable category
  and priority, and timestamps.

Ticket list/detail endpoints, conversation replies, and internal-note handling
are not implemented yet.

The authentication cookie uses `SameSite=Lax`, is secure only in production,
and expires with the configured `JWT_EXPIRES_IN` lifetime. Logout clears the
cookie in the current browser; because the JWT is stateless, it does not revoke
a token that has already been copied elsewhere, which remains valid until it
expires.

Helmet adds HTTP security headers to API responses; the browser-oriented
Content Security Policy is disabled because this server does not serve a
frontend. Login is limited to five attempts per client IP every 15 minutes.
The limiter uses the direct connection IP; proxy headers are not trusted by
default.

Type-check and build the backend with:

```sh
npm run typecheck
npm run build
npm start
```

`npm start` runs the compiled server after `npm run build`.

## Data model decisions

- **Books are a separate collection:** each book references its author, making
  ownership checks and future ticket-to-book relationships straightforward.
- **User is separate from Author:** admins do not have author records, and
  password hashes belong on account documents rather than author profiles.
- **Ticket values follow the assignment:** categories, priorities, and statuses
  use the labels specified in the PDF. Category and priority may remain `null`
  if AI assistance is unavailable; newly created tickets default to `Open`.
- **Ticket assignment and messages:** tickets reference their author, optional
  book, and optional assigned User by MongoDB ObjectId. Public replies and
  internal notes have distinct message types; this model does not itself
  enforce who can read or create either type.
- **AI suggestions are separate:** suggested category, priority, and draft
  response are stored apart from the confirmed ticket values so an admin can
  review or override them.
- **Nullable fields are stored as `null`:** this keeps fields consistently
  present in API responses instead of having to handle both null and missing
  values.
- **Seed behavior is deliberate:** the script upserts only authors, books, and
  users, preserves supplied royalty values, warns rather than recalculating
  mismatched royalties, and refuses production runs unless forced.
- **Demo accounts are for this assignment only:** all author demo accounts
  share the password from `SEED_DEMO_PASSWORD`; the admin account uses
  `SEED_ADMIN_PASSWORD`. Re-running the seed sets them to the current values in
  `.env`.
