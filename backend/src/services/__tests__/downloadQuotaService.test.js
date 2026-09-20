jest.mock('../../database/db');
jest.mock('../../utils/appSettings');

const { getAppSetting } = require('../../utils/appSettings');
const { db } = require('../../database/db');
const svc = require('../downloadQuotaService');

function mockTables({ settings, ledgerCount, ledgerIds = [], orders = [] }) {
  db.mockImplementation((table) => {
    if (table === 'event_download_quota_settings') {
      return { where: () => ({ first: async () => settings }) };
    }
    if (table === 'event_photo_downloads') {
      return {
        where: () => ({
          count: async () => [{ count: ledgerCount }],
          whereIn: () => ({ pluck: async () => ledgerIds }),
        }),
      };
    }
    if (table === 'download_quota_orders') {
      return { where: () => ({ select: async () => orders }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getAppSetting.mockImplementation(async (key, fallback) => fallback);
});

describe('getQuotaState', () => {
  test('a gallery with the feature off reports disabled and counts nothing', async () => {
    mockTables({ settings: { quota_enabled: false }, ledgerCount: 0 });
    const state = await svc.getQuotaState(1);
    expect(state.enabled).toBe(false);
    expect(state.total).toBeNull();
  });

  test('total is the free limit plus every approved grant', async () => {
    mockTables({
      settings: { quota_enabled: true, free_limit: 20 },
      ledgerCount: 5,
      orders: [{ granted_photo_count: 10, grants_unlimited: false },
        { granted_photo_count: 20, grants_unlimited: false }],
    });
    const state = await svc.getQuotaState(1);
    expect(state.total).toBe(50);
    expect(state.used).toBe(5);
    expect(state.remaining).toBe(45);
  });

  test('one approved unlimited order makes the gallery unlimited', async () => {
    mockTables({
      settings: { quota_enabled: true, free_limit: 20 },
      ledgerCount: 999,
      orders: [{ granted_photo_count: null, grants_unlimited: true }],
    });
    const state = await svc.getQuotaState(1);
    expect(state.unlimited).toBe(true);
    expect(state.remaining).toBeNull();
  });

  test('a missing per-event row falls back to the system default', async () => {
    getAppSetting.mockImplementation(async (key) =>
      key === 'download_quota_default_free_limit' ? 30 : 1);
    mockTables({ settings: undefined, ledgerCount: 0 });
    const state = await svc.getQuotaState(1);
    expect(state.enabled).toBe(false);
    expect(state.freeLimit).toBe(30);
  });

  // The gallery-facing order screens word themselves differently depending on
  // this: a client placing an order needs to know up front whether it settles
  // immediately or waits on the photographer.
  test('reports whether the gallery auto-approves its own orders', async () => {
    mockTables({ settings: { quota_enabled: true, free_limit: 20, auto_approve: true }, ledgerCount: 0 });
    const state = await svc.getQuotaState(1);
    expect(state.autoApprove).toBe(true);
  });

  test('a gallery that never turned auto-approve on reports false, not undefined', async () => {
    mockTables({ settings: { quota_enabled: true, free_limit: 20 }, ledgerCount: 0 });
    const state = await svc.getQuotaState(1);
    expect(state.autoApprove).toBe(false);
  });

  test('a gallery with no settings row at all still reports autoApprove as false', async () => {
    mockTables({ settings: undefined, ledgerCount: 0 });
    const state = await svc.getQuotaState(1);
    expect(state.autoApprove).toBe(false);
  });
});

describe('checkAllowance', () => {
  test('photos already in the ledger do not consume a slot again', async () => {
    mockTables({
      settings: { quota_enabled: true, free_limit: 20 },
      ledgerCount: 20, ledgerIds: [1, 2, 3], orders: [],
    });
    const result = await svc.checkAllowance(1, [1, 2, 3]);
    expect(result.newPhotoIds).toEqual([]);
    expect(result.allowed).toBe(true);
  });

  test('a bulk request that exceeds the remaining slots is refused whole', async () => {
    mockTables({
      settings: { quota_enabled: true, free_limit: 10 },
      ledgerCount: 5, ledgerIds: [], orders: [],
    });
    const result = await svc.checkAllowance(1, [11, 12, 13, 14, 15, 16, 17]);
    expect(result.allowed).toBe(false);
    expect(result.missingSlots).toBe(2);
  });

  test('duplicate ids in one request count once', async () => {
    mockTables({
      settings: { quota_enabled: true, free_limit: 1 },
      ledgerCount: 0, ledgerIds: [], orders: [],
    });
    const result = await svc.checkAllowance(1, [9, 9, 9]);
    expect(result.allowed).toBe(true);
    expect(result.newPhotoIds).toEqual([9]);
  });
});

describe('isPayingClient', () => {
  test('a portal customer arriving as guest still counts as a paying client', () => {
    expect(svc.isPayingClient({ accessLevel: 'guest', viaCustomer: true })).toBe(true);
  });
  test('a plain guest does not', () => {
    expect(svc.isPayingClient({ accessLevel: 'guest' })).toBe(false);
  });
  test('a PIN client does', () => {
    expect(svc.isPayingClient({ accessLevel: 'client' })).toBe(true);
  });
});

describe('assertDownloadAccess', () => {
  test('lets everyone through while the feature is off', async () => {
    mockTables({ settings: { quota_enabled: false }, ledgerCount: 0 });
    const result = await svc.assertDownloadAccess({ accessLevel: 'guest' }, 1);
    expect(result.ok).toBe(true);
  });

  test('blocks a plain guest once the feature is on', async () => {
    mockTables({ settings: { quota_enabled: true, free_limit: 20 }, ledgerCount: 0, orders: [] });
    const result = await svc.assertDownloadAccess({ accessLevel: 'guest' }, 1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.code).toBe('DOWNLOAD_NOT_ALLOWED_FOR_GUEST');
  });

  test('never blocks an admin preview', async () => {
    mockTables({ settings: { quota_enabled: true, free_limit: 20 }, ledgerCount: 0, orders: [] });
    const result = await svc.assertDownloadAccess({ accessLevel: 'guest', isAdminPreview: true }, 1);
    expect(result.ok).toBe(true);
  });
});
