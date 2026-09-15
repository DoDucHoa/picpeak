'use strict';

const { scheduledTask } = require('./scheduledTask');
const { expireStaleOrders } = require('./downloadOrderService');
const logger = require('../utils/logger');

/**
 * Closes download orders nobody acted on.
 *
 * Without this a lapsed order keeps the gallery's single pending slot, and the
 * client is told an order is already waiting every time they try to buy again:
 * the one thing they cannot fix themselves.
 */
async function sweep() {
  try {
    const expired = await expireStaleOrders();
    if (expired > 0) {
      logger.info(`Expired ${expired} stale download order(s)`);
    }
    return expired;
  } catch (error) {
    // Swallowed rather than rethrown: a sweep that cannot reach the database
    // should retry on the next tick, not take the scheduler down with it.
    logger.warn('Download order expiry sweep failed', { error: error.message });
    return 0;
  }
}

const task = scheduledTask(sweep, { schedule: '0 * * * *' });

function startDownloadOrderExpiryChecker() { task.start(); }
const stopDownloadOrderExpiryChecker = () => task.stop();

module.exports = { startDownloadOrderExpiryChecker, stopDownloadOrderExpiryChecker, sweep };
