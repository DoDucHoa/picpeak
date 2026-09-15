jest.mock('../downloadOrderService');
jest.mock('../../utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));

const cron = require('node-cron');
const logger = require('../../utils/logger');
const { expireStaleOrders } = require('../downloadOrderService');
const {
  sweep, startDownloadOrderExpiryChecker, stopDownloadOrderExpiryChecker,
} = require('../downloadOrderExpiryChecker');

beforeEach(() => jest.clearAllMocks());

describe('download order expiry sweep', () => {
  test('closes the orders the service reports as lapsed', async () => {
    expireStaleOrders.mockResolvedValue(3);

    await expect(sweep()).resolves.toBe(3);
    expect(expireStaleOrders).toHaveBeenCalledTimes(1);
  });

  test('says nothing on a quiet pass, so the log stays readable', async () => {
    expireStaleOrders.mockResolvedValue(0);

    await sweep();

    expect(logger.info).not.toHaveBeenCalled();
  });

  // A sweep that cannot reach the database must retry on the next tick rather
  // than take the scheduler down and stop every later sweep with it.
  test('survives a database failure instead of rethrowing', async () => {
    expireStaleOrders.mockRejectedValue(new Error('connection terminated'));

    await expect(sweep()).resolves.toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  test('runs hourly once started, and stops cleanly', async () => {
    startDownloadOrderExpiryChecker();

    expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
    await expect(stopDownloadOrderExpiryChecker()).resolves.toBeUndefined();
  });
});
