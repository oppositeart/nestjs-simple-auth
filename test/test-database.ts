import { config } from 'dotenv';
import { expand } from 'dotenv-expand';

/**
 * Reads the e2e test database connection string from POSTGRES_TEST_URI.
 * Variables already set in the environment take precedence over `.env`.
 * @returns Connection string of the test database
 */
export function getTestDatabaseUri(): string {
  expand(config({ quiet: true }));

  const testUri = process.env.POSTGRES_TEST_URI;
  const devUri = process.env.POSTGRES_URI;

  if (!testUri) {
    throw new Error(
      'POSTGRES_TEST_URI is not set. Add it to .env (see .env.example).',
    );
  }

  // E2E tests delete all users, so never let them run against the dev database.
  if (devUri && isSameDatabase(testUri, devUri)) {
    throw new Error(
      'POSTGRES_TEST_URI points to the same database as POSTGRES_URI. Use a separate database for e2e tests.',
    );
  }

  return testUri;
}

function isSameDatabase(first: string, second: string) {
  const a = new URL(first);
  const b = new URL(second);

  return a.host === b.host && a.pathname === b.pathname;
}
