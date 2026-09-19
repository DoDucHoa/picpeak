jest.mock('../services/downloadQuotaService');
jest.mock('../utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { EventEmitter } = require('events');
const {
  assertDownloadAccess, reserveSlots, releaseReservation, checkAllowance,
} = require('../services/downloadQuotaService');
const {
  quotaRejection, passesQuotaGate, settleReservation,
} = require('../routes/gallery/downloadQuotaGate');
const logger = require('../utils/logger');

function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

/**
 * A response that behaves like Node's: 'close' fires on every outcome, and
 * `writableFinished` is what separates "the client got the whole body" from
 * "the socket went away mid-transfer".
 */
function streamingRes({ writableFinished = true, statusCode = 200 } = {}) {
  const res = new EventEmitter();
  res.writableFinished = writableFinished;
  res.statusCode = statusCode;
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
  test('lets a gallery with the feature off through without claiming anything', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: false } });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2, 3])).resolves.toEqual({ ok: true, reserved: [] });

    expect(reserveSlots).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('refuses a viewer who is not the paying client with 403', async () => {
    assertDownloadAccess.mockResolvedValue({
      ok: false, status: 403, code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST', state: { enabled: true },
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1])).resolves.toEqual({ ok: false, reserved: [] });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' });
  });

  test('refuses an over-quota request with 402 and the numbers to act on', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: true } });
    reserveSlots.mockResolvedValue({
      allowed: false,
      state: { total: 20, used: 18, remaining: 2 },
      newPhotoIds: [1, 2, 3, 4, 5],
      missingSlots: 3,
      reserved: [],
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2, 3, 4, 5]))
      .resolves.toEqual({ ok: false, reserved: [] });

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'DOWNLOAD_QUOTA_EXCEEDED', missing_slots: 3, requested_new: 5,
    }));
  });

  /**
   * The gate hands the claimed rows back rather than keeping them, because the
   * route is the only thing that learns what was actually delivered and so the
   * only thing that can refund the difference.
   */
  test('hands the claimed ledger rows back to the route that must settle them', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: true } });
    reserveSlots.mockResolvedValue({
      allowed: true,
      state: { total: 20, used: 1, remaining: 19 },
      newPhotoIds: [2],
      missingSlots: 0,
      reserved: [{ id: 77, photo_id: 2 }],
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2]))
      .resolves.toEqual({ ok: true, reserved: [{ id: 77, photo_id: 2 }] });
    expect(res.status).not.toHaveBeenCalled();
  });

  /**
   * Fail CLOSED. The old gate swallowed the error and allowed the download,
   * reasoning that the quota was a billing aid rather than a security boundary.
   * That turned any error at all into unlimited free downloads, which is the
   * one outcome the feature exists to prevent. Refusing costs nothing extra in
   * practice: every error here is a database error, and the download itself
   * cannot read its photo rows without the same database.
   */
  test('refuses with 503 when the quota lookup itself throws', async () => {
    assertDownloadAccess.mockRejectedValue(new Error('connection terminated'));

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1])).resolves.toEqual({ ok: false, reserved: [] });

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ code: 'DOWNLOAD_QUOTA_UNAVAILABLE' });
  });

  test('says why it refused instead of failing silently', async () => {
    assertDownloadAccess.mockRejectedValue(new Error('connection terminated'));

    await passesQuotaGate(req, fakeRes(), [1]);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('quota'),
      expect.objectContaining({ eventId: 1, error: 'connection terminated' })
    );
  });
});

/**
 * Preparing a resolution-picker archive is gated twice: a read-only look at the
 * allowance when the job is created, so minutes of CPU are not spent building
 * something the client cannot take, and a real claim when the finished file is
 * handed over. Claiming at creation instead would charge for an archive whose
 * build then failed, or which the client never came back for.
 */
describe('passesQuotaGate in preflight mode', () => {
  test('reads the allowance without claiming a single slot', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: true } });
    checkAllowance.mockResolvedValue({
      allowed: true, state: { total: 20, used: 1, remaining: 19 }, newPhotoIds: [2], missingSlots: 0,
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2], { reserve: false }))
      .resolves.toEqual({ ok: true, reserved: [] });

    expect(reserveSlots).not.toHaveBeenCalled();
    expect(checkAllowance).toHaveBeenCalledWith(1, [1, 2]);
  });

  test('still refuses a job the allowance cannot cover', async () => {
    assertDownloadAccess.mockResolvedValue({ ok: true, state: { enabled: true } });
    checkAllowance.mockResolvedValue({
      allowed: false,
      state: { total: 20, used: 19, remaining: 1 },
      newPhotoIds: [1, 2, 3],
      missingSlots: 2,
    });

    const res = fakeRes();
    await expect(passesQuotaGate(req, res, [1, 2, 3], { reserve: false }))
      .resolves.toEqual({ ok: false, reserved: [] });

    expect(res.status).toHaveBeenCalledWith(402);
    expect(reserveSlots).not.toHaveBeenCalled();
  });
});

/**
 * Settling is hooked to 'close' rather than 'finish' because only 'close' fires
 * on every outcome. A client who cancels a 900 MB archive halfway never emits
 * 'finish', and with the charge taken up front that silence would cost them the
 * whole gallery's allowance.
 */
describe('settleReservation', () => {
  const reserved = [{ id: 1, photo_id: 10 }, { id: 2, photo_id: 11 }];

  beforeEach(() => releaseReservation.mockResolvedValue(0));

  test('refunds the photos the archive could not deliver', async () => {
    const res = streamingRes();
    settleReservation(res, req, reserved, () => [10]);

    res.emit('close');
    await Promise.resolve();

    expect(releaseReservation).toHaveBeenCalledWith(reserved, [10]);
  });

  test('refunds everything when the client aborts mid-transfer', async () => {
    const res = streamingRes({ writableFinished: false });
    settleReservation(res, req, reserved, () => [10, 11]);

    res.emit('close');
    await Promise.resolve();

    expect(releaseReservation).toHaveBeenCalledWith(reserved, []);
  });

  test('refunds everything when the response ended in an error status', async () => {
    const res = streamingRes({ statusCode: 500 });
    settleReservation(res, req, reserved, () => [10, 11]);

    res.emit('close');
    await Promise.resolve();

    expect(releaseReservation).toHaveBeenCalledWith(reserved, []);
  });

  test('settles once even when close fires more than once', async () => {
    const res = streamingRes();
    settleReservation(res, req, reserved, () => [10]);

    res.emit('close');
    res.emit('close');
    await Promise.resolve();

    expect(releaseReservation).toHaveBeenCalledTimes(1);
  });

  test('costs a gallery with nothing claimed no listener and no query', async () => {
    const res = streamingRes();
    settleReservation(res, req, [], () => [10]);

    res.emit('close');
    await Promise.resolve();

    expect(releaseReservation).not.toHaveBeenCalled();
  });

  test('reports a refund that could not be written instead of swallowing it', async () => {
    releaseReservation.mockRejectedValue(new Error('deadlock detected'));
    const res = streamingRes();
    settleReservation(res, req, reserved, () => [10]);

    res.emit('close');
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('refund'),
      expect.objectContaining({ eventId: 1, error: 'deadlock detected' })
    );
  });
});
