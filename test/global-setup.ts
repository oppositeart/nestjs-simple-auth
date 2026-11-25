import { execSync } from 'node:child_process';
import { getTestDatabaseUri } from './test-database.js';

/**
 * Runs once before the e2e tests: creates the test database if it doesn't
 * exist and syncs its tables with the Prisma schema.
 */
export default function setup() {
  execSync('npx prisma db push', {
    stdio: 'inherit',
    env: { ...process.env, POSTGRES_URI: getTestDatabaseUri() },
  });
}
