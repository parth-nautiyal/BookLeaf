import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseSeedFile } from '../scripts/seed';

const sampleFilePath = path.resolve(
  process.cwd(),
  'data',
  'bookleaf_sample_data.json',
);

interface SampleData {
  authors: Array<{
    author_id: string;
    books: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>;
}

async function parseTemporaryData(
  data: unknown,
): Promise<Awaited<ReturnType<typeof parseSeedFile>>> {
  const directory = await mkdtemp(path.join(tmpdir(), 'bookleaf-seed-test-'));
  const filePath = path.join(directory, 'seed.json');

  try {
    await writeFile(filePath, JSON.stringify(data), 'utf8');
    return await parseSeedFile(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readSampleData(): Promise<SampleData> {
  return JSON.parse(await readFile(sampleFilePath, 'utf8'));
}

test('parses the supplied sample with 10 authors and 18 books', async () => {
  const data = await parseSeedFile(sampleFilePath);
  const bookCount = data.authors.reduce(
    (total, author) => total + author.books.length,
    0,
  );

  assert.equal(data.authors.length, 10);
  assert.equal(bookCount, 18);
});

test('preserves nullable and empty values for BK013 and BK015', async () => {
  const data = await parseSeedFile(sampleFilePath);
  const books = data.authors.flatMap((author) => author.books);

  for (const bookId of ['BK013', 'BK015']) {
    const book = books.find((candidate) => candidate.book_id === bookId);

    assert.ok(book, `${bookId} should exist in sample data`);
    assert.equal(book.mrp, null);
    assert.equal(book.publication_date, null);
    assert.equal(book.print_partner, null);
    assert.equal(book.author_royalty_per_copy, null);
    assert.equal(book.last_royalty_payout_date, null);
    assert.deepEqual(book.available_on, []);
  }
});

test('the four specified published books have a null last payout date', async () => {
  const data = await parseSeedFile(sampleFilePath);
  const publishedBooks = data.authors
    .flatMap((author) => author.books)
    .filter((book) => book.status === 'Published & Live');
  const publishedBooksWithoutPayoutDate = publishedBooks
    .filter((book) => book.last_royalty_payout_date === null)
    .map((book) => book.book_id)
    .sort();

  assert.deepEqual(publishedBooksWithoutPayoutDate, [
    'BK005',
    'BK010',
    'BK016',
    'BK018',
  ]);
});

test('rejects malformed book data with its field path', async () => {
  const data = await readSampleData();
  data.authors[0].books[0].mrp = '399';

  await assert.rejects(
    () => parseTemporaryData(data),
    /authors\.0\.books\.0\.mrp/,
  );
});

test('rejects duplicate authorId values', async () => {
  const data = await readSampleData();
  data.authors.push({ ...data.authors[0], books: [] });

  await assert.rejects(() => parseTemporaryData(data), /Duplicate authorId/);
});

test('rejects duplicate bookId values', async () => {
  const data = await readSampleData();
  data.authors[0].books[1].book_id = data.authors[0].books[0].book_id;

  await assert.rejects(() => parseTemporaryData(data), /Duplicate bookId/);
});

test('rejects duplicate ISBN values', async () => {
  const data = await readSampleData();
  data.authors[0].books[1].isbn = data.authors[0].books[0].isbn;

  await assert.rejects(() => parseTemporaryData(data), /Duplicate ISBN/);
});
