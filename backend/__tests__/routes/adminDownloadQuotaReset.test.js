/**
 * POST /api/admin/events/:id/download-quota/reset
 *
 * The ledger arithmetic is proven against real Postgres in
 * integration/downloadQuotaResetPg.test.js. This suite pins the wiring: the
 * route needs the edit permission, empties the ledger of the right gallery,
 * leaves an audit line naming the admin, and answers with the fresh numbers
 * the settings card renders.
 */

const express = require('express');
const request = require('supertest');

const permissionsAsked = [];

jest.mock('../../src/middleware/auth', () => ({
  adminAuth: (req, _res, next) => { req.admin = { id: 7, username: 'photographer' }; next(); },
}));
jest.mock('../../src/middleware/permissions', () => ({
  requirePermission: (name) => {
    const guard = (req, _res, next) => { permissionsAsked.push({ name, path: req.path }); next(); };
    return guard;
  },
}));
jest.mock('../../src/middleware/ownership', () => ({
  requireEventOwnership: (_req, _res, next) => next(),
  scopeEventsQuery: (query) => query,
}));
jest.mock('../../src/database/db', () => ({
  db: jest.fn(),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/downloadQuotaService', () => ({
  getQuotaState: jest.fn(),
  resetLedger: jest.fn(),
}));

const { logActivity } = require('../../src/database/db');
const quotaService = require('../../src/services/downloadQuotaService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../../src/routes/adminDownloadQuota'));
  return app;
}

beforeEach(() => {
  permissionsAsked.length = 0;
  jest.clearAllMocks();
});

test('empties the ledger of that gallery and answers with the fresh allowance', async () => {
  quotaService.resetLedger.mockResolvedValue(12);
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, used: 0, total: 20, remaining: 20 });

  const res = await request(buildApp()).post('/api/admin/events/42/download-quota/reset');

  expect(res.status).toBe(200);
  expect(quotaService.resetLedger).toHaveBeenCalledWith(42);
  expect(res.body).toEqual({ cleared: 12, quota: { enabled: true, used: 0, total: 20, remaining: 20 } });
});

test('needs the edit permission, not just the view one', async () => {
  quotaService.resetLedger.mockResolvedValue(0);
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, used: 0 });

  await request(buildApp()).post('/api/admin/events/42/download-quota/reset');

  expect(permissionsAsked.map((p) => p.name)).toEqual(['events.edit']);
});

test('leaves an audit line naming the admin and how many photos were cleared', async () => {
  quotaService.resetLedger.mockResolvedValue(3);
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, used: 0 });

  await request(buildApp()).post('/api/admin/events/42/download-quota/reset');

  expect(logActivity).toHaveBeenCalledWith(
    'download_quota_reset',
    { cleared: 3 },
    42,
    { type: 'admin', id: 7, name: 'photographer' },
  );
});

test('a failing reset answers 500 and logs nothing', async () => {
  quotaService.resetLedger.mockRejectedValue(new Error('connection lost'));

  const res = await request(buildApp()).post('/api/admin/events/42/download-quota/reset');

  expect(res.status).toBe(500);
  expect(logActivity).not.toHaveBeenCalled();
});
