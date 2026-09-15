jest.mock('../services/downloadQuotaService');
jest.mock('../utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { assertDownloadAccess, checkAllowance } = require('../services/downloadQuotaService');
const { quotaRejection, passesQuotaGate } = require('../routes/gallery/downloadQuotaGate');

function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const req = { event: { id: 1 }, accessLevel: 'client' };

beforeEach(() => jest.clearAllMocks());

describe('quotaRejection', () => {
  test('carries every number the purchase dialog needs', () => {
    const body = quotaRejection({
      state: { total: 20, used: 20, remaining: 0 },
      newPhotoIds: [1, 2, 3],
      missingSlots: 3,
    });

    expect(body).toEqual({
      code: 'DOWNLOAD_QUOTA_EXCEEDED',
      quota: { total: 20, used: 20, remaining: 0 },
      requested_new: 3,
      missing_slots: 3,
    });
  });
});

describe('passesQuotaGate', () => {
  test('lets a gallery with the feature off through without counting anything', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: false } });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2, 3])).resolves.toBe(true);

    expect(checkAllowance).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('refuses a viewer who is not the paying client with 403', async () => {
    assertDownloadAccess.mockResolvedValue({
      ok: false, status: 403, code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST', state: { enabled: true },
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1])).resolves.toBe(false);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' });
  });

  test('refuses an over-quota request with 402 and the numbers to act on', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: true } });
    checkAllowance.mockResolvedValue({
      allowed: false,
      state: { total: 20, used: 18, remaining: 2 },
      newPhotoIds: [1, 2, 3, 4, 5],
      missingSlots: 3,
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2, 3, 4, 5])).resolves.toBe(false);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'DOWNLOAD_QUOTA_EXCEEDED', missing_slots: 3, requested_new: 5,
    }));
  });

  test('allows a request that still fits', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: true } });
    checkAllowance.mockResolvedValue({
      allowed: true, state: { total: 20, used: 1, remaining: 19 }, newPhotoIds: [2], missingSlots: 0,
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2])).resolves.toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  // The quota is a billing aid, not a security boundary. A broken quota lookup
  // must not take downloads offline for a client who has already paid.
  test('fails open when the quota lookup itself throws', async () => {
    assertDownloadAccess.mockRejectedValue(new Error('connection terminated'));

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1])).resolves.toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
