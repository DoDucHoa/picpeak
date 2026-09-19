// Pin the database engine for the whole suite, at module scope so it lands
// before the test file is evaluated and therefore before anything requires
// src/database/db, which reads knexfile at module-init time.
//
// knexfile calls dotenv.config(), so backend/.env reaches the tests, and the
// documented local setup sets DATABASE_CLIENT=pg. Without this line the test
// environment resolves to Postgres and the suites that boot a database run
// every core migration against the real development database: they abort at
// CREATE TABLE "migrations" only because that table already exists. It is also
// why the backend suite looks healthy inside a git worktree and collapses in
// the main checkout, a worktree having no backend/.env of its own.
//
// The Postgres integration suites are unaffected: they build their own knex
// from PICPEAK_PG_TEST_URL against a throwaway database and never use the
// application's connection.
process.env.NODE_ENV = 'test';
process.env.DATABASE_CLIENT = 'sqlite3';

// Supertest 6 binds an IPv6 wildcard listener but hardcodes an IPv4 URL.
// macOS can allocate that IPv6 port while a different IPv4 service owns it.
// Address the listener's actual family so a test cannot reach that service.
jest.mock('supertest/lib/test', () => {
  const Test = jest.requireActual('supertest/lib/test');
  const serverAddress = Test.prototype.serverAddress;
  Test.prototype.serverAddress = function(app, path) {
    const url = serverAddress.call(this, app, path);
    return app.address()?.family === 'IPv6'
      ? url.replace('://127.0.0.1:', '://[::1]:')
      : url;
  };
  return Test;
});

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  if (!process.env.SKIP_S3_TESTS) {
    process.env.SKIP_S3_TESTS = 'true';
  }
  if (!process.env.STORAGE_PATH) {
    process.env.STORAGE_PATH = '/storage';
  }
});

// Dispose resources loaded by this suite using the application's draining
// shutdown. Individual fixtures still own temporary files and other DB pools.
afterAll(async () => {
  await require('./src/services/serviceShutdown').stopServices();
  const loadedDb = require.cache[require.resolve('./src/database/db')];
  if (typeof loadedDb?.exports.db?.destroy === 'function') await loadedDb.exports.db.destroy();
});
