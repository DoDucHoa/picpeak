jest.mock('../../database/db');

const { db } = require('../../database/db');
const { resolvePackages, decoratePackage } = require('../downloadPackagePricing');

/**
 * Records the shape of every query issued against download_packages so a test
 * can assert which price list was read, not merely what came back.
 */
function mockPackageTable({ own = [], global: globalRows = [] }) {
  const queries = [];
  db.mockImplementation((table) => {
    if (table !== 'download_packages') {
      throw new Error(`unexpected table ${table}`);
    }
    const query = { scope: null, filter: {}, order: null };
    queries.push(query);
    const builder = {
      where: (filter) => {
        if (query.scope === null) query.scope = 'event';
        Object.assign(query.filter, filter);
        return builder;
      },
      whereNull: (column) => {
        query.scope = 'global';
        query.nullColumn = column;
        return builder;
      },
      orderBy: (column, direction) => {
        query.order = [column, direction];
        return Promise.resolve(query.scope === 'global' ? globalRows : own);
      },
    };
    return builder;
  });
  return queries;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('decoratePackage', () => {
  test('savings compare the package price against the per photo price', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 20, price: 18 }, 1);
    expect(out.savings_percent).toBe(10);
  });

  test('a package with no discount reports no savings instead of zero percent', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 10, price: 10 }, 1);
    expect(out.savings_percent).toBeNull();
  });

  test('an unlimited package has no savings figure', () => {
    const out = decoratePackage({ kind: 'unlimited', photo_count: null, price: 300 }, 1);
    expect(out.savings_percent).toBeNull();
  });

  test('the auto label carries count and price so an unnamed package still renders', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 20, price: 18 }, 1);
    expect(out.auto_label).toEqual({ count: 20, price: 18, savings_percent: 10 });
  });

  test('a package dearer than the per photo price advertises nothing rather than a negative saving', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 10, price: 12 }, 1);
    expect(out.savings_percent).toBeNull();
  });

  test('an unconfigured per photo price yields no savings rather than a division by zero', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 10, price: 8 }, 0);
    expect(out.savings_percent).toBeNull();
    expect(out.auto_label.savings_percent).toBeNull();
  });

  test('a price arriving from postgres as a decimal string is still compared numerically', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 20, price: '18.00' }, '1.00');
    expect(out.savings_percent).toBe(10);
    expect(out.auto_label.price).toBe(18);
  });

  test('the original package fields survive decoration', () => {
    const out = decoratePackage({ id: 3, kind: 'quantity', photo_count: 20, price: 18, name_i18n: { en: 'Twenty' } }, 1);
    expect(out.id).toBe(3);
    expect(out.name_i18n).toEqual({ en: 'Twenty' });
  });

  test('the unit price is what this package itself costs per photo, not the gallery base rate', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 5, price: 3 }, 1);
    expect(out.unit_price).toBe(0.6);
  });

  test('an unlimited package has no unit price, since it has no photo count to divide by', () => {
    const out = decoratePackage({ kind: 'unlimited', photo_count: null, price: 300 }, 1);
    expect(out.unit_price).toBeNull();
  });

  test('a price arriving as a decimal string still divides to a numeric unit price', () => {
    const out = decoratePackage({ kind: 'quantity', photo_count: 5, price: '3.00' }, 1);
    expect(out.unit_price).toBe(0.6);
  });
});

describe('resolvePackages', () => {
  test('a gallery with its own price list uses only that list', async () => {
    const own = [{ id: 10, event_id: 7, kind: 'quantity', photo_count: 10, price: 9 }];
    const queries = mockPackageTable({ own, global: [{ id: 1, event_id: null, price: 10 }] });

    const rows = await resolvePackages(7);

    expect(rows).toEqual(own);
    expect(queries).toHaveLength(1);
    expect(queries[0].scope).toBe('event');
  });

  test('the global list is never merged into a gallery that has its own', async () => {
    const own = [{ id: 10, event_id: 7, price: 9 }];
    mockPackageTable({ own, global: [{ id: 1, event_id: null, price: 10 }] });

    const rows = await resolvePackages(7);

    expect(rows.map((r) => r.id)).toEqual([10]);
  });

  test('a gallery with no rows of its own falls back to the global list', async () => {
    const globalRows = [{ id: 1, event_id: null, kind: 'quantity', photo_count: 10, price: 10 }];
    const queries = mockPackageTable({ own: [], global: globalRows });

    const rows = await resolvePackages(7);

    expect(rows).toEqual(globalRows);
    expect(queries).toHaveLength(2);
    expect(queries[1].scope).toBe('global');
    expect(queries[1].nullColumn).toBe('event_id');
  });

  test('both queries ask the database for active rows in sort order', async () => {
    const queries = mockPackageTable({ own: [], global: [] });

    await resolvePackages(7);

    expect(queries[0].filter).toEqual({ event_id: 7, is_active: true });
    expect(queries[0].order).toEqual(['sort_order', 'asc']);
    expect(queries[1].filter).toEqual({ is_active: true });
    expect(queries[1].order).toEqual(['sort_order', 'asc']);
  });

  test('a gallery and a system with no packages at all returns an empty list', async () => {
    mockPackageTable({ own: [], global: [] });
    await expect(resolvePackages(7)).resolves.toEqual([]);
  });

  test('an explicit connection is used in place of the default one', async () => {
    const conn = jest.fn(() => ({
      where: () => ({ orderBy: () => Promise.resolve([{ id: 42 }]) }),
      whereNull: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }),
    }));

    const rows = await resolvePackages(7, conn);

    expect(rows).toEqual([{ id: 42 }]);
    expect(conn).toHaveBeenCalledWith('download_packages');
    expect(db).not.toHaveBeenCalled();
  });
});
