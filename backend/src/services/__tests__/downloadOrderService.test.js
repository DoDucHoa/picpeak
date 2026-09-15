jest.mock('../../database/db');
jest.mock('../../utils/appSettings');
jest.mock('../downloadPackagePricing');
jest.mock('../businessProfileService');

const { db } = require('../../database/db');
const { getAppSetting } = require('../../utils/appSettings');
const { resolvePackages } = require('../downloadPackagePricing');
const { getProfile } = require('../businessProfileService');
const svc = require('../downloadOrderService');

const DAY_MS = 24 * 60 * 60 * 1000;

/** One order row plus the update spy the assertions read back. */
function mockOrderRow(row) {
  const update = jest.fn(async (patch) => { Object.assign(row, patch); return 1; });
  db.mockImplementation((table) => {
    if (table === 'download_quota_orders') {
      return {
        where: () => ({ first: async () => row, update }),
        insert: jest.fn(() => ({ returning: async () => [row] })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { row, update };
}

/** The insert path, with the payload kept so the snapshot can be inspected. */
function mockInsert() {
  const returning = jest.fn(async () => [{ id: 42, status: 'pending' }]);
  const insert = jest.fn(() => ({ returning }));
  db.mockImplementation((table) => {
    if (table === 'download_quota_orders') return { insert };
    throw new Error(`unexpected table ${table}`);
  });
  return { insert, returning };
}

beforeEach(() => {
  jest.clearAllMocks();
  getAppSetting.mockImplementation(async (key, fallback) => fallback);
  getProfile.mockResolvedValue({ profile: { default_currency: 'eur' }, bankAccounts: [] });
  resolvePackages.mockResolvedValue([
    { id: 1, kind: 'quantity', photo_count: 20, price: '18.00', name_i18n: { en: 'Twenty more' } },
    { id: 2, kind: 'unlimited', photo_count: null, price: '300.00', name_i18n: null },
  ]);
});

describe('createOrder', () => {
  test('freezes the package into the order so a later price edit cannot rewrite it', async () => {
    const { insert } = mockInsert();
    await svc.createOrder({ eventId: 1, packageId: 1, req: { accessLevel: 'client' }, origin: 'client' });

    const payload = insert.mock.calls[0][0];
    expect(JSON.parse(payload.package_snapshot)).toEqual({
      kind: 'quantity',
      photo_count: 20,
      price: 18,
      currency: 'EUR',
      name_i18n: { en: 'Twenty more' },
    });
    expect(payload.requested_photo_count).toBe(20);
    expect(payload.status).toBe('pending');
    expect(payload.origin).toBe('client');
  });

  test('reads the currency from the business profile, not from app_settings', async () => {
    const { insert } = mockInsert();
    await svc.createOrder({ eventId: 1, packageId: 1, req: {}, origin: 'client' });

    expect(getProfile).toHaveBeenCalled();
    expect(JSON.parse(insert.mock.calls[0][0].package_snapshot).currency).toBe('EUR');
    expect(getAppSetting).not.toHaveBeenCalledWith(
      expect.stringMatching(/currency/i), expect.anything(), expect.anything()
    );
  });

  test('an unlimited package asks for no photo count', async () => {
    const { insert } = mockInsert();
    await svc.createOrder({ eventId: 1, packageId: 2, req: {}, origin: 'client' });

    const payload = insert.mock.calls[0][0];
    expect(payload.requested_photo_count).toBeNull();
    expect(JSON.parse(payload.package_snapshot).kind).toBe('unlimited');
  });

  test('the expiry deadline comes from the configured number of days', async () => {
    getAppSetting.mockImplementation(async (key, fallback) => (
      key === 'download_quota_order_expiry_days' ? 7 : fallback
    ));
    const { insert } = mockInsert();
    const before = Date.now();
    await svc.createOrder({ eventId: 1, packageId: 1, req: {}, origin: 'client' });

    const expiresAt = insert.mock.calls[0][0].expires_at.getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS + 1000);
  });

  test('a package id that is not on this gallery price list is refused', async () => {
    mockInsert();
    await expect(svc.createOrder({ eventId: 1, packageId: 999, req: {}, origin: 'client' }))
      .rejects.toBeInstanceOf(svc.UnknownPackageError);
  });

  test('a second pending order surfaces as PendingOrderExistsError', async () => {
    db.mockImplementation(() => ({
      insert: () => ({ returning: async () => {
        const err = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        err.constraint = 'download_quota_orders_one_pending';
        throw err;
      } }),
    }));
    await expect(svc.createOrder({ eventId: 1, packageId: 1, req: {}, origin: 'client' }))
      .rejects.toBeInstanceOf(svc.PendingOrderExistsError);
  });

  test('an unrelated database error is not disguised as a pending order clash', async () => {
    db.mockImplementation(() => ({
      insert: () => ({ returning: async () => {
        const err = new Error('null value in column "event_id"');
        err.code = '23502';
        throw err;
      } }),
    }));
    await expect(svc.createOrder({ eventId: 1, packageId: 1, req: {}, origin: 'client' }))
      .rejects.not.toBeInstanceOf(svc.PendingOrderExistsError);
  });
});

describe('approveOrder', () => {
  test('approving an order that is not pending is refused', async () => {
    mockOrderRow({ id: 5, status: 'approved', requested_photo_count: 20 });
    await expect(svc.approveOrder({ orderId: 5, adminId: 1 }))
      .rejects.toBeInstanceOf(svc.InvalidTransitionError);
  });

  test('approval defaults the granted count to what the package asked for', async () => {
    const { row } = mockOrderRow({ id: 5, status: 'pending', requested_photo_count: 20,
      package_snapshot: { kind: 'quantity', photo_count: 20 } });
    await svc.approveOrder({ orderId: 5, adminId: 1 });
    expect(row.granted_photo_count).toBe(20);
    expect(row.status).toBe('approved');
    expect(row.approved_by).toBe(1);
  });

  test('approval honours an override typed by the photographer', async () => {
    const { row } = mockOrderRow({ id: 5, status: 'pending', requested_photo_count: 20,
      package_snapshot: { kind: 'quantity', photo_count: 20 } });
    await svc.approveOrder({ orderId: 5, adminId: 1, grantedPhotoCount: 25 });
    expect(row.granted_photo_count).toBe(25);
  });

  test('an unlimited package grants unlimited and no photo count', async () => {
    const { row } = mockOrderRow({ id: 6, status: 'pending', requested_photo_count: null,
      package_snapshot: { kind: 'unlimited', photo_count: null } });
    await svc.approveOrder({ orderId: 6, adminId: 1 });
    expect(row.grants_unlimited).toBe(true);
    expect(row.granted_photo_count).toBeNull();
  });

  test('an order that does not exist is refused rather than silently ignored', async () => {
    mockOrderRow(undefined);
    await expect(svc.approveOrder({ orderId: 404, adminId: 1 }))
      .rejects.toBeInstanceOf(svc.InvalidTransitionError);
  });
});

describe('rejectOrder', () => {
  test('rejecting without a reason is refused', async () => {
    mockOrderRow({ id: 7, status: 'pending' });
    await expect(svc.rejectOrder({ orderId: 7, adminId: 1, reason: '   ' }))
      .rejects.toThrow(/reason/i);
  });

  test('the stored reason is trimmed', async () => {
    const { row } = mockOrderRow({ id: 7, status: 'pending' });
    await svc.rejectOrder({ orderId: 7, adminId: 1, reason: '  fully booked  ' });
    expect(row.status).toBe('rejected');
    expect(row.reason).toBe('fully booked');
  });

  test('rejecting an order that is no longer pending is refused', async () => {
    mockOrderRow({ id: 7, status: 'expired' });
    await expect(svc.rejectOrder({ orderId: 7, adminId: 1, reason: 'too late' }))
      .rejects.toBeInstanceOf(svc.InvalidTransitionError);
  });
});

describe('expireStaleOrders', () => {
  test('expiry only touches pending orders past their expires_at', async () => {
    const update = jest.fn(async () => 1);
    const whereRaw = jest.fn(() => ({ update }));
    db.mockImplementation(() => ({ where: () => ({ where: whereRaw }) }));
    const touched = await svc.expireStaleOrders(new Date('2026-10-01T00:00:00Z'));
    expect(touched).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }));
    expect(whereRaw).toHaveBeenCalledWith('expires_at', '<=', new Date('2026-10-01T00:00:00Z'));
  });
});

describe('getPendingOrder', () => {
  test('a gallery with no pending order answers null rather than undefined', async () => {
    db.mockImplementation(() => ({ where: () => ({ first: async () => undefined }) }));
    expect(await svc.getPendingOrder(1)).toBeNull();
  });

  test('the pending order of the gallery is returned as is', async () => {
    db.mockImplementation(() => ({ where: () => ({ first: async () => ({ id: 9, status: 'pending' }) }) }));
    expect(await svc.getPendingOrder(1)).toEqual({ id: 9, status: 'pending' });
  });
});
