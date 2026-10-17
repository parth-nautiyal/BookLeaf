# BookLeaf Author Support Portal — Backend Foundation

This TypeScript backend currently provides an Express server, MongoDB connection,
Author, Book, and User models, a Zod-validated sample-data seed script, and a
database-backed health check. It does not yet include authentication routes,
tickets, AI features, or a frontend.

## Requirements

- Node.js 20 or newer
- A MongoDB server you can connect to

## Local setup

From the project root, install dependencies and create your local environment
file from the template:

```sh
npm install
cp .env.example .env
```

Edit `.env` and set `MONGODB_URI` to the MongoDB connection string for your
development database. The example uses a local MongoDB database named
`bookleaf_portal`.

The seed script also requires these local environment variables:

- `SEED_DEMO_PASSWORD` — password assigned to all seeded author accounts
- `SEED_ADMIN_EMAIL` — email for the seeded admin account
- `SEED_ADMIN_PASSWORD` — password for the seeded admin account

Use your own development values in `.env`. Do not put real credentials in
`.env.example`, source code, or documentation. The seed script hashes account
passwords with bcryptjs before storing them.

## Seed sample data

With MongoDB running and `.env` configured, seed the supplied data:

```sh
npm run seed
```

By default, the script reads `data/bookleaf_sample_data.json`. To use another
seed file, set `SEED_FILE` in `.env`.

The script prints the target database name (not the connection string), then
upserts author, book, and user records. It expects the author and book
collections to contain the records represented by the seed file when finished;
with the supplied file, that is 10 authors and 18 books. It also reports the
number of users. Re-running the command updates matching records instead of
creating duplicates. The seed does not delete documents or write to collections
other than authors, books, and users.

The seed refuses to run when `NODE_ENV=production` unless explicitly forced:

```sh
npm run seed -- --force
```

Use `--force` only when you have deliberately verified the target database.

## Development and checks

Start the API in development mode:

```sh
npm run dev
```

Check types and compile the TypeScript backend:

```sh
npm run typecheck
npm run build
```

Start the compiled server after building:

```sh
npm start
```

The server connects to MongoDB before listening. If the connection fails or
`MONGODB_URI` is missing, startup reports the error and exits with a failure
status.

Check the health endpoint while the server is running:

```sh
curl -i http://localhost:3000/health
```

When MongoDB is connected, it returns HTTP 200 and
`{"status":"ok","database":"connected"}`. If the server is running while the
database is disconnected, it returns HTTP 503 and
`{"status":"error","database":"disconnected"}`.

There is not yet a test script in `package.json`; seed-parser tests are planned
for a later implementation step.

## Data model decisions

- Books are stored in a separate collection and reference their author. This
  makes ownership checks and future ticket-to-book relationships straightforward.
- Nullable book fields are stored as explicit `null` values, keeping the API
  response shape consistent for the frontend.
- Seeding maps the supplied JSON's snake_case field names to camelCase model
  fields. It stores the supplied royalty numbers as-is and only warns if the
  paid and pending amounts do not sum to the recorded total.
- Seeding is idempotent for the author, book, and user records it upserts, and
  has a production guard to reduce the risk of accidental production writes.
