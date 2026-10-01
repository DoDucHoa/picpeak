/**
 * The admin address for everything tied to an event (P3 of the event form
 * redesign, spec 5.11): the global notification email when it is set,
 * otherwise the event's own admin_email, otherwise none, and the mail is
 * skipped as before. Workflows, approvals, invoices and contracts keep using
 * business_profile.email.
 */
const validator = require('validator');
const { db } = require('../database/db');
const logger = require('../utils/logger');
const { decodeSettingValue } = require('./eventSettings');

const NOTIFICATION_EMAIL_KEY = 'general_notification_email';

/** The global address, trimmed and valid, or null. Never throws. */
async function getNotificationEmail(conn = db) {
  try {
    const row = await conn('app_settings').where('setting_key', NOTIFICATION_EMAIL_KEY).first();
    const value = row ? decodeSettingValue(row.setting_value) : null;
    const address = typeof value === 'string' ? value.trim() : '';
    return address && validator.isEmail(address) ? address : null;
  } catch (error) {
    logger.error('Failed to read the notification email', { error: error.message });
    return null;
  }
}

/** Global address, else the event's own, else null. */
async function resolveAdminEmail(event, conn = db) {
  const global = await getNotificationEmail(conn);
  if (global) return global;
  const own = typeof event?.admin_email === 'string' ? event.admin_email.trim() : '';
  return own || null;
}

module.exports = { NOTIFICATION_EMAIL_KEY, getNotificationEmail, resolveAdminEmail };
