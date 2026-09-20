'use strict';

const { db, logActivity } = require('../database/db');
const { getAppSetting } = require('../utils/appSettings');
const { resolvePackages } = require('./downloadPackagePricing');
const { getProfile } = require('./businessProfileService');

const EXPIRY_DAYS_KEY = 'download_quota_order_expiry_days';
const DEFAULT_EXPIRY_DAYS = 14;
const ONE_PENDING_INDEX = 'download_quota_orders_one_pending';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A gallery already has an order waiting for the photographer. Route answers 409. */
class PendingOrderExistsError extends Error {
  constructor(message = 'This gallery already has an order waiting for approval') {
    super(message);
    this.name = 'PendingOrderExistsError';
    this.code = 'PENDING_ORDER_EXISTS';
  }
}

/** The order is not in a state where the requested decision is meaningful. */
class InvalidTransitionError extends Error {
  constructor(message = 'This order can no longer be decided') {
    super(message);
    this.name = 'InvalidTransitionError';
    this.code = 'INVALID_ORDER_TRANSITION';
  }
}

/** The package id does not belong to the price list this gallery is offered. */
class UnknownPackageError extends Error {
  constructor(message = 'This package is not available for this gallery') {
    super(message);
    this.name = 'UnknownPackageError';
    this.code = 'UNKNOWN_PACKAGE';
  }
}

/**
 * Currency comes from business_profile.default_currency, the same column every
 * invoice and quote reads. There is no app_settings key for it: inventing one
 * would let the gallery quote a package in a currency no invoice ever uses.
 * getProfile() answers { profile, bankAccounts }, so the column is one level
 * down. A gallery must still be able to place an order on an install whose
 * profile row is unreadable, hence the fallback.
 */
async function resolveCurrency(conn) {
  try {
    const { profile } = await getProfile(conn);
    return String(profile?.default_currency || 'CHF').toUpperCase();
  } catch (_) {
    return 'CHF';
  }
}

function actorSnapshot(req) {
  const isCustomer = !!(req && (req.viaCustomer || req.accessLevel === 'client'));
  return { type: isCustomer ? 'customer' : 'guest' };
}

/** jsonb arrives parsed from Postgres and as text from anything else. */
function parseJson(value) {
  if (value == null || typeof value === 'object') return value ?? null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

/** Shared between an auto-approved insert and a manual approveOrder() decision. */
function grantFromSnapshot(snapshot, requestedPhotoCount) {
  const unlimited = snapshot?.kind === 'unlimited';
  return {
    grants_unlimited: unlimited,
    granted_photo_count: unlimited ? null : requestedPhotoCount,
  };
}

function isPendingClash(err) {
  if (!err || err.code !== '23505') return false;
  const detail = `${err.constraint || ''} ${err.detail || ''} ${err.message || ''}`;
  return detail.includes(ONE_PENDING_INDEX);
}

/**
 * The snapshot is what the client agreed to buy, frozen at the moment of the
 * order. Editing the package afterwards must not rewrite that agreement, so the
 * order never reads the live row again.
 */
function freezePackage(pkg, currency) {
  return {
    kind: pkg.kind,
    photo_count: pkg.photo_count == null ? null : Number(pkg.photo_count),
    price: Number(pkg.price),
    currency,
    name_i18n: parseJson(pkg.name_i18n),
  };
}

async function createOrder({ eventId, packageId, req, origin = 'client', reason, conn = db }) {
  const packages = await resolvePackages(eventId, conn);
  const pkg = (packages || []).find((p) => Number(p.id) === Number(packageId));
  if (!pkg) throw new UnknownPackageError();

  const currency = await resolveCurrency(conn);
  // The connection has to travel with the read: inside a transaction a bare
  // app_settings read grabs a second connection while the trx holds one.
  const days = Number(await getAppSetting(EXPIRY_DAYS_KEY, DEFAULT_EXPIRY_DAYS, conn));
  const expiryDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_EXPIRY_DAYS;

  const snapshot = freezePackage(pkg, currency);
  const now = new Date();
  const requestedPhotoCount = snapshot.kind === 'unlimited' ? null : snapshot.photo_count;

  // A gallery that never touched its quota settings has no row here at all,
  // which reads the same as auto_approve being off.
  const settings = await conn('event_download_quota_settings').where({ event_id: eventId }).first();
  const autoApprove = !!settings?.auto_approve;
  const grant = autoApprove ? grantFromSnapshot(snapshot, requestedPhotoCount) : null;

  const payload = {
    event_id: eventId,
    package_id: pkg.id,
    package_snapshot: JSON.stringify(snapshot),
    requested_photo_count: requestedPhotoCount,
    grants_unlimited: autoApprove ? grant.grants_unlimited : false,
    status: autoApprove ? 'approved' : 'pending',
    // Two origins only, and 'photographer' is the spelling the admin route and
    // the spec both use. Collapsing an unknown value into 'client' would erase
    // the audit trail behind a manual grant, which is the only reason the
    // column exists: a goodwill allowance has to stay distinguishable from
    // something the client ordered and is expected to pay for.
    origin: origin === 'photographer' ? 'photographer' : 'client',
    // Reused from the rejection column: a client order never sets it here, but
    // a photographer's goodwill grant is worth a note for whoever reviews the
    // order list later, and the list already renders `reason` when present.
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    actor: JSON.stringify(actorSnapshot(req)),
    expires_at: new Date(now.getTime() + expiryDays * DAY_MS),
    created_at: now,
    updated_at: now,
  };

  if (autoApprove) {
    // No admin decided this one: approved_by stays null so the record never
    // credits a human who never looked at the order.
    payload.granted_photo_count = grant.granted_photo_count;
    payload.approved_by = null;
    payload.approved_at = now;
  }

  try {
    // Two clients ordering at the same instant is exactly the case a
    // read-then-insert check misses, so the partial unique index decides it and
    // the raw Postgres violation is translated here instead of leaking out.
    // `.returning('*')` is not decoration: without it knex hands back no rows on
    // Postgres and the caller is given nothing to show the client.
    const [row] = await conn('download_quota_orders').insert(payload).returning('*');

    // The only automated link in the whole chain. The client now waits for a
    // human to approve, and the photographer learns there is something to
    // approve from this notification alone: no reminder email follows it. If it
    // stops firing, orders sit untouched until they expire and nobody notices.
    // Deliberately not awaited: a notification failure must not undo an order
    // the client has already been told was placed.
    Promise.resolve(logActivity('download_order_created', {
      package_kind: snapshot.kind,
      photo_count: snapshot.photo_count,
      price: snapshot.price,
      currency: snapshot.currency,
      origin: payload.origin,
    }, eventId, actorSnapshot(req))).catch(() => {});

    return row;
  } catch (err) {
    if (isPendingClash(err)) throw new PendingOrderExistsError();
    throw err;
  }
}

async function getOrderOrThrow(orderId, conn) {
  const order = await conn('download_quota_orders').where({ id: orderId }).first();
  if (!order) throw new InvalidTransitionError(`Order ${orderId} does not exist`);
  return order;
}

async function approveOrder({ orderId, adminId, grantedPhotoCount, conn = db }) {
  const order = await getOrderOrThrow(orderId, conn);
  if (order.status !== 'pending') {
    throw new InvalidTransitionError(`Order ${orderId} is ${order.status}, not pending`);
  }

  const snapshot = parseJson(order.package_snapshot);
  const requested = grantedPhotoCount == null ? order.requested_photo_count : grantedPhotoCount;
  const grant = grantFromSnapshot(snapshot, requested == null ? null : Number(requested));
  const now = new Date();

  await conn('download_quota_orders').where({ id: orderId }).update({
    status: 'approved',
    grants_unlimited: grant.grants_unlimited,
    granted_photo_count: grant.granted_photo_count,
    approved_by: adminId ?? null,
    approved_at: now,
    updated_at: now,
  });
  return getOrderOrThrow(orderId, conn);
}

async function rejectOrder({ orderId, adminId, reason, conn = db }) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed) {
    const err = new Error('A rejection reason is required');
    err.code = 'REASON_REQUIRED';
    throw err;
  }

  const order = await getOrderOrThrow(orderId, conn);
  if (order.status !== 'pending') {
    throw new InvalidTransitionError(`Order ${orderId} is ${order.status}, not pending`);
  }

  const now = new Date();
  // approved_by and approved_at are the decision columns, not approval-only
  // ones: a rejection is a decision too and the photographer who made it has to
  // stay on the record.
  await conn('download_quota_orders').where({ id: orderId }).update({
    status: 'rejected',
    reason: trimmed,
    approved_by: adminId ?? null,
    approved_at: now,
    updated_at: now,
  });
  return getOrderOrThrow(orderId, conn);
}

/**
 * One statement, so a sweep can never half-apply and never races the client
 * placing a fresh order. Rows with a NULL expires_at are excluded by the
 * comparison itself and stay pending forever, which is what an order with no
 * deadline means.
 */
async function expireStaleOrders(now = new Date(), conn = db) {
  const cutoff = now instanceof Date ? now : new Date(now);
  const changed = await conn('download_quota_orders')
    .where({ status: 'pending' })
    .where('expires_at', '<=', cutoff)
    .update({ status: 'expired', updated_at: new Date() });
  return Number(changed) || 0;
}

async function getPendingOrder(eventId, conn = db) {
  const order = await conn('download_quota_orders')
    .where({ event_id: eventId, status: 'pending' })
    .first();
  return order || null;
}

module.exports = {
  createOrder,
  approveOrder,
  rejectOrder,
  expireStaleOrders,
  getPendingOrder,
  PendingOrderExistsError,
  InvalidTransitionError,
  UnknownPackageError,
};
