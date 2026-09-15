const express = require('express');
const request = require('supertest');

let mockAccessLevel = 'client';
let mockViaCustomer = false;

jest.mock('../middleware/gallery', () => ({
  verifyGalleryAccess: (req, _res, next) => {
    req.event = { id: 1, slug: 'wedding' };
    req.accessLevel = mockAccessLevel;
    req.viaCustomer = mockViaCustomer;
    next();
  },
  denySlideshowToken: (_req, _res, next) => next(),
}));
jest.mock('../utils/revealMode', () => ({ blockHiddenGallery: (_req, _res, next) => next() }));
jest.mock('../services/downloadQuotaService');
jest.mock('../services/downloadPackagePricing');
jest.mock('../services/downloadOrderService');
// Mocked so the route test never opens a real database pool. It also pins the
// shape getProfile() actually returns, which is the wrapper and not the profile.
jest.mock('../services/businessProfileService');

const quotaService = require('../services/downloadQuotaService');
const pricing = require('../services/downloadPackagePricing');
const orders = require('../services/downloadOrderService');
const businessProfile = require('../services/businessProfileService');

function app() {
  const a = express();
  a.use(express.json());
  a.use(require('../routes/gallery/quota'));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccessLevel = 'client';
  mockViaCustomer = false;
  quotaService.isPayingClient.mockImplementation((req) =>
    req.accessLevel === 'client' || !!req.viaCustomer);
  quotaService.getQuotaState.mockResolvedValue({ enabled: false, total: null, used: 0, remaining: null });
  quotaService.getDownloadedPhotoIds.mockResolvedValue([]);
  pricing.resolvePackages.mockResolvedValue([]);
  pricing.decoratePackage.mockImplementation((p) => p);
  orders.getPendingOrder.mockResolvedValue(null);
  businessProfile.getProfile.mockResolvedValue({
    profile: { default_currency: 'EUR' },
    bankAccounts: [],
  });
});

test('a gallery with the feature off answers with a disabled quota, not an error', async () => {
  quotaService.getQuotaState.mockResolvedValue({ enabled: false, total: null, used: 0, remaining: null });
  quotaService.getDownloadedPhotoIds.mockResolvedValue([]);
  orders.getPendingOrder.mockResolvedValue(null);

  const res = await request(app()).get('/wedding/download-quota');

  expect(res.status).toBe(200);
  expect(res.body.quota.enabled).toBe(false);
  expect(res.body.downloaded_photo_ids).toEqual([]);
  expect(res.body.packages).toEqual([]);
  expect(res.body.pending_order).toBeNull();
  expect(quotaService.getDownloadedPhotoIds).not.toHaveBeenCalled();
});

test('the payload carries the ids the grid needs to mark photos as delivered', async () => {
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, unlimited: false, total: 20, used: 2, remaining: 18, pricePerPhoto: 1 });
  quotaService.getDownloadedPhotoIds.mockResolvedValue([4, 9]);
  orders.getPendingOrder.mockResolvedValue(null);

  const res = await request(app()).get('/wedding/download-quota');

  expect(res.body.downloaded_photo_ids).toEqual([4, 9]);
  expect(res.body.quota.remaining).toBe(18);
});

test('packages are decorated against the per photo price of this gallery', async () => {
  quotaService.getQuotaState.mockResolvedValue({ enabled: true, unlimited: false, total: 20, used: 0, remaining: 20, pricePerPhoto: 2 });
  pricing.resolvePackages.mockResolvedValue([{ id: 1, kind: 'quantity', photo_count: 20, price: 30 }]);
  pricing.decoratePackage.mockImplementation((p, price) => ({ ...p, savings_percent: 25, price_per_photo: price }));

  const res = await request(app()).get('/wedding/download-quota');

  expect(pricing.decoratePackage).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 2);
  expect(res.body.packages[0].savings_percent).toBe(25);
});

test('the quoted currency comes from the business profile, not the wrapper around it', async () => {
  const res = await request(app()).get('/wedding/download-quota');

  expect(res.body.currency).toBe('EUR');
});

test('a plain guest cannot place an order', async () => {
  mockAccessLevel = 'guest';
  const res = await request(app()).post('/wedding/download-orders').send({ package_id: 1 });

  expect(res.status).toBe(403);
  expect(res.body.code).toBe('DOWNLOAD_NOT_ALLOWED_FOR_GUEST');
  expect(orders.createOrder).not.toHaveBeenCalled();
});

test('a portal customer arriving as guest can place an order', async () => {
  mockAccessLevel = 'guest';
  mockViaCustomer = true;
  orders.createOrder.mockResolvedValue({ id: 3, status: 'pending' });

  const res = await request(app()).post('/wedding/download-orders').send({ package_id: 1 });

  expect(res.status).toBe(201);
  expect(res.body.id).toBe(3);
});

test('a second pending order answers 409 rather than a raw database error', async () => {
  class PendingOrderExistsError extends Error {}
  orders.PendingOrderExistsError = PendingOrderExistsError;
  orders.createOrder.mockRejectedValue(new PendingOrderExistsError('already pending'));

  const res = await request(app()).post('/wedding/download-orders').send({ package_id: 1 });

  expect(res.status).toBe(409);
  expect(res.body.code).toBe('PENDING_ORDER_EXISTS');
});

test('an unknown package is a client mistake, so it answers 400 and not 500', async () => {
  class UnknownPackageError extends Error {}
  orders.UnknownPackageError = UnknownPackageError;
  orders.createOrder.mockRejectedValue(new UnknownPackageError('no such package'));

  const res = await request(app()).post('/wedding/download-orders').send({ package_id: 999 });

  expect(res.status).toBe(400);
  expect(res.body.code).toBe('UNKNOWN_PACKAGE');
});

test('a missing package_id is refused before the service is called', async () => {
  const res = await request(app()).post('/wedding/download-orders').send({});

  expect(res.status).toBe(400);
  expect(orders.createOrder).not.toHaveBeenCalled();
});

test('a package_id that is not a number is refused before the service is called', async () => {
  const res = await request(app()).post('/wedding/download-orders').send({ package_id: 'free-please' });

  expect(res.status).toBe(400);
  expect(orders.createOrder).not.toHaveBeenCalled();
});
