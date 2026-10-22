import 'dotenv/config';
import { z } from 'zod';

const mongoUriSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          ['mongodb:', 'mongodb+srv:'].includes(url.protocol) &&
          url.hostname.length > 0
        );
      } catch {
        return false;
      }
    },
    { message: 'must be a valid MongoDB connection string' },
  );

const jwtExpirySchema = z
  .string()
  .regex(
    /^[1-9]\d*(s|m|h|d)$/,
    'must use a positive duration such as 30m or 1d',
  )
  .default('1d');

const clientUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        url.pathname === '/' &&
        url.search === '' &&
        url.hash === ''
      );
    },
    { message: 'must be an explicit HTTP(S) origin without a path' },
  )
  .transform((value) => new URL(value).origin);

const runtimeEnvSchema = z
  .object({
    MONGODB_URI: mongoUriSchema,
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    JWT_SECRET: z.string().min(32, 'must contain at least 32 characters'),
    JWT_EXPIRES_IN: jwtExpirySchema,
    CLIENT_URL: clientUrlSchema,
  })
  .transform((environment) => ({
    mongodbUri: environment.MONGODB_URI,
    port: environment.PORT,
    jwtSecret: environment.JWT_SECRET,
    jwtExpiresIn: environment.JWT_EXPIRES_IN,
    clientUrl: environment.CLIENT_URL,
  }));

export type RuntimeConfig = z.infer<typeof runtimeEnvSchema> & {
  jwtExpiresInMs: number;
};

export function getMongoDbUri(): string {
  const result = mongoUriSchema.safeParse(process.env.MONGODB_URI);

  if (!result.success) {
    throw new Error(
      'MONGODB_URI is required and must be a valid MongoDB connection string.',
    );
  }

  return result.data;
}

export function getClientUrl(): string {
  const result = clientUrlSchema.safeParse(process.env.CLIENT_URL);

  if (!result.success) {
    throw new Error(
      'CLIENT_URL is required and must be an explicit HTTP(S) origin.',
    );
  }

  return result.data;
}

function durationToMilliseconds(duration: string): number {
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(duration);

  if (!match) {
    throw new Error(
      'JWT_EXPIRES_IN must be a positive duration such as 30m or 1d.',
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const millisecondsPerUnit = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
  };

  switch (unit) {
    case 's':
      return amount * millisecondsPerUnit.second;
    case 'm':
      return amount * millisecondsPerUnit.minute;
    case 'h':
      return amount * millisecondsPerUnit.hour;
    case 'd':
      return amount * millisecondsPerUnit.day;
    default:
      throw new Error(
        'JWT_EXPIRES_IN must use seconds (s), minutes (m), hours (h), or days (d).',
      );
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  const result = runtimeEnvSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid runtime configuration: ${details}`);
  }

  return {
    ...result.data,
    jwtExpiresInMs: durationToMilliseconds(result.data.jwtExpiresIn),
  };
}

export function getTestMongoUri(): string {
  const testUriResult = mongoUriSchema.safeParse(process.env.TEST_MONGODB_URI);

  if (!testUriResult.success) {
    throw new Error(
      'TEST_MONGODB_URI is required and must be a valid MongoDB connection string for database tests.',
    );
  }

  if (testUriResult.data === getMongoDbUri()) {
    throw new Error('TEST_MONGODB_URI must not equal MONGODB_URI.');
  }

  const databaseName = new URL(testUriResult.data).pathname
    .split('/')
    .filter(Boolean)[0];

  if (!databaseName || !/(^|[-_])test($|[-_])/i.test(databaseName)) {
    throw new Error(
      'TEST_MONGODB_URI must identify a database with a test name, such as bookleaf_test.',
    );
  }

  return testUriResult.data;
}
