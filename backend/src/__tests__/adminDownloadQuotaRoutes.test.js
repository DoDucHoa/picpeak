const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({ adminAuth: (req, _res, next) => { req.admin = { id: 1, roleName: 'super_admin' }; next(); } }));
jest.mock('../middleware/permissions', () => ({ requirePermission: () => (_req, _res, next) => next() }));
jest.mock('../middleware/ownership', () => ({
  requireEventOwnership: (_req, _res, next) => next(),
  scopeEventsQuery: (query) => query,
}));
jest.mock('../database/db');
jest.mock('../services/downloadOrderService');
jest.mock('../services/downloadQuotaService');

const { db } = require('../database/db');
const orders = require('../services/downloadOrderService');
const quotaService = require('../services/downloadQuotaService');

function app() {
  const a = express();
  a.use(express.json());
  a.use(require('../routes/adminDownloadQuota'));
  return a;
}

beforeEach(() => jest.clearAllMocks());

test('approving an order passes the typed amount through to the service', async () => {
  orders.approveOrder.mockResolvedValue({ id: 5, status: 'approved', granted_photo_count: 25 });

  const res = await request(app()).post('/download-orders/5/approve').send({ granted_photo_count: 25 });

  expect(res.status).toBe(200);
  expect(orders.approveOrder).toHaveBeenCalledWith({ orderId: 5, adminId: 1, grantedPhotoCount: 25 });
});

test('approving an order that is no longer pending answers 409, not 500', async () => {
  class InvalidTransitionError extends Error {}
  orders.InvalidTransitionError = InvalidTransitionError;
  orders.approveOrder.mockRejectedValue(new InvalidTransitionError('already approved'));

  const res = await request(app()).post('/download-orders/5/approve').send({});

  expect(res.status).toBe(409);
  expect(res.body.code).toBe('INVALID_ORDER_TRANSITION');
});

test('rejecting without a reason is refused before the service is called', async () => {
  const res = await request(app()).post('/download-orders/5/reject').send({ reason: '  ' });

  expect(res.status).toBe(400);
  expect(orders.rejectOrder).not.toHaveBeenCalled();
});

test('an order the photographer creates is marked as theirs, not the client\'s', async () => {
  orders.createOrder.mockResolvedValue({ id: 9, origin: 'photographer' });

  const res = await request(app())
    .post('/events/1/download-orders')
    .send({ package_id: 2, reason: 'goodwill after the reprint delay' });

  expect(res.status).toBe(201);
  expect(orders.createOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: 1,
      origin: 'photographer',
      reason: 'goodwill after the reprint delay',
    })
  );
});

test('a photographer order without a reason is refused before the service is called', async () => {
  const res = await request(app())
    .post('/events/1/download-orders')
    .send({ package_id: 2 });

  expect(res.status).toBe(400);
  expect(res.body.code).toBe('REASON_REQUIRED');
  expect(orders.createOrder).not.toHaveBeenCalled();
});

test('a photographer order with a whitespace-only reason is refused', async () => {
  const res = await request(app())
    .post('/events/1/download-orders')
    .send({ package_id: 2, reason: '   ' });

  expect(res.status).toBe(400);
  expect(res.body.code).toBe('REASON_REQUIRED');
  expect(orders.createOrder).not.toHaveBeenCalled();
});

test('turning the feature off never deletes a ledger row', async () => {
  const del = jest.fn();
  const update = jest.fn(async () => 1);
  db.mockImplementation((table) => {
    if (table === 'event_download_quota_settings') {
      return { where: () => ({ first: async () => ({ id: 1 }), update }) };
    }
    if (table === 'event_photo_downloads') return { where: () => ({ delete: del }), delete: del };
    throw new Error(`unexpected table ${table}`);
  });
  quotaService.getQuotaState.mockResolvedValue({ enabled: false });

  const res = await request(app()).put('/events/1/download-quota').send({ quota_enabled: false });

  expect(res.status).toBe(200);
  expect(del).not.toHaveBeenCalled();
});

test('an empty free limit is stored as null, meaning inherit, never as zero', async () => {
  const update = jest.fn(async () => 1);
  db.mockImplementation(() => ({ where: () => ({ first: async () => ({ id: 1 }), update }) }));
  quotaService.getQuotaState.mockResolvedValue({ enabled: true });

  await request(app()).put('/events/1/download-quota').send({ free_limit: null });

  expect(update).toHaveBeenCalledWith(expect.objectContaining({ free_limit: null }));
});

test('a free limit of zero is stored as zero, because that gallery grants nothing free', async () => {
  const update = jest.fn(async () => 1);
  db.mockImplementation(() => ({ where: () => ({ first: async () => ({ id: 1 }), update }) }));
  quotaService.getQuotaState.mockResolvedValue({ enabled: true });

  await request(app()).put('/events/1/download-quota').send({ free_limit: 0 });

  expect(update).toHaveBeenCalledWith(expect.objectContaining({ free_limit: 0 }));
});

test('the ledger endpoint answers one page plus the grand total', async () => {
  const rows = [{ id: 2, photo_id: 9, filename: 'b.jpg' }, { id: 1, photo_id: 4, filename: 'a.jpg' }];
  db.mockImplementation((table) => {
    if (table === 'event_photo_downloads') {
      return { where: () => ({ count: async () => [{ count: '2' }] }) };
    }
    if (table === 'event_photo_downloads as d') {
      return {
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({ offset: () => ({ select: async () => rows }) }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  const res = await request(app()).get('/events/1/download-ledger?page=1&limit=50');

  expect(res.status).toBe(200);
  expect(res.body.total).toBe(2);
  expect(res.body.items).toHaveLength(2);
});

test('importing translations reports what was loaded and what was skipped', async () => {
  const update = jest.fn(async () => 1);
  db.mockImplementation(() => ({
    whereIn: () => ({ select: async () => [{ id: 3 }] }),
    where: () => ({ update }),
  }));

  const res = await request(app()).post('/download-packages/import').send({
    packages: [
      { id: 3, name: { en: '20 photos', de: '20 Fotos', vi: '20 anh' } },
      { id: 404, name: { en: 'ghost' } },
    ],
  });

  expect(res.status).toBe(200);
  expect(res.body.imported).toBe(1);
  expect(res.body.skipped).toBe(1);
  expect(res.body.skipped_ids).toEqual([404]);
  expect(update).toHaveBeenCalledTimes(1);
});

test('an import file without a packages array is refused with a readable message', async () => {
  const update = jest.fn();
  db.mockImplementation(() => ({ whereIn: () => ({ select: async () => [] }), where: () => ({ update }) }));

  const res = await request(app()).post('/download-packages/import').send({ rows: [] });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/packages/i);
  expect(update).not.toHaveBeenCalled();
});

test('a package dropped from the list is deactivated, not deleted', async () => {
  const del = jest.fn();
  const update = jest.fn(async () => 1);
  const whereInUpdate = jest.fn(async () => 1);
  db.mockImplementation((table) => {
    if (table !== 'download_packages') throw new Error(`unexpected table ${table}`);
    return {
      whereNull: () => ({ select: async () => [{ id: 7 }, { id: 8 }], orderBy: async () => [] }),
      where: () => ({ update, delete: del }),
      whereIn: () => ({ update: whereInUpdate }),
      delete: del,
    };
  });

  const res = await request(app()).put('/download-packages').send({
    packages: [{ id: 7, kind: 'quantity', photo_count: 20, price: 18 }],
  });

  expect(res.status).toBe(200);
  expect(del).not.toHaveBeenCalled();
  expect(whereInUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
});

test('the edit tab\'s own package list stays empty when the gallery has none, even if the global list is not', async () => {
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, pricePerPhoto: null });
  db.mockImplementation((table) => {
    if (table !== 'download_packages') throw new Error(`unexpected table ${table}`);
    return {
      where: () => ({ orderBy: async () => [] }),
    };
  });

  const res = await request(app()).get('/events/1/download-packages');

  expect(res.status).toBe(200);
  expect(res.body.packages).toEqual([]);
});

test('creating an order for a client resolves to the global packages when the gallery has none of its own', async () => {
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, pricePerPhoto: null });
  const globalPackages = [{ id: 3, event_id: null, kind: 'quantity', photo_count: 10, price: '10', name_i18n: null, sort_order: 0, is_active: true }];
  db.mockImplementation((table) => {
    if (table !== 'download_packages') throw new Error(`unexpected table ${table}`);
    return {
      where: (cond) => {
        // The gallery's own list, tried first — empty here.
        if (cond && cond.event_id === 1) return { orderBy: async () => [] };
        // The global fallback, chained off whereNull('event_id').
        return { orderBy: async () => globalPackages };
      },
      whereNull: () => ({
        where: () => ({ orderBy: async () => globalPackages }),
      }),
    };
  });

  const res = await request(app()).get('/events/1/download-packages?resolved=true');

  expect(res.status).toBe(200);
  expect(res.body.packages).toHaveLength(1);
  expect(res.body.packages[0]).toMatchObject({ id: 3, event_id: null });
});

test('creating an order for a client prefers the gallery own packages over the global list', async () => {
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, pricePerPhoto: null });
  const ownPackages = [{ id: 9, event_id: 1, kind: 'quantity', photo_count: 5, price: '5', name_i18n: null, sort_order: 0, is_active: true }];
  db.mockImplementation((table) => {
    if (table !== 'download_packages') throw new Error(`unexpected table ${table}`);
    return {
      where: () => ({ orderBy: async () => ownPackages }),
      whereNull: () => {
        throw new Error('the global fallback must not be queried once the gallery has its own packages');
      },
    };
  });

  const res = await request(app()).get('/events/1/download-packages?resolved=true');

  expect(res.status).toBe(200);
  expect(res.body.packages).toHaveLength(1);
  expect(res.body.packages[0]).toMatchObject({ id: 9, event_id: 1 });
});
