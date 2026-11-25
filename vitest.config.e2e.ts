import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { getTestDatabaseUri } from './test/test-database.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Create the test database and its tables before the tests run.
    globalSetup: ['./test/global-setup.ts'],
    // The app reads POSTGRES_URI, so point it at the test database.
    // Values set here take precedence over .env.
    env: {
      POSTGRES_URI: getTestDatabaseUri(),
    },
  },
});
