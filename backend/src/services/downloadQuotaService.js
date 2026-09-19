'use strict';

const { db } = require('../database/db');
const { getAppSetting } = require('../utils/appSettings');

const KEYS = {
  freeLimit: 'download_quota_default_free_limit',
  pricePerPhoto: 'download_quota_default_price_per_photo',
};

/**
 * Namespace for the per-event advisory lock reserveSlots takes. 214 is this
 * feature's migration number, so "does anything else use this key" is a
 * question grep can answer. Pair it with the event id and the lock is per
 * gallery: two galleries never wait on each other.
 */
const QUOTA_LOCK_NAMESPACE = 214;

function isPostgres(conn) {
  return conn?.client?.config?.client === 'pg';
}

/**
 * A portal token runs as accessLevel 'guest' but carries req.viaCustomer, and a
 * PIN login carries accessLevel 'client'. Both are paying clients. Testing
 * accessLevel alone would lock out exactly the people who paid. Same expression
 * galleryActor() uses in routes/gallery/downloads.js.
 */
function isPayingClient(req) {
  return !!(req && (req.accessLevel === 'client' || req.viaCustomer));
}

async function getSettings(eventId, conn = db) {
  const row = await conn('event_download_quota_settings').where({ event_id: eventId }).first();
  // A NULL column means "inherit the system default", which is not the same as 0
  // ("no free downloads at all"), so the default is never written to the row.
  const freeLimit = row?.free_limit ?? Number(await getAppSetting(KEYS.freeLimit, 20, conn));
  const pricePerPhoto = row?.price_per_photo != null
    ? Number(row.price_per_photo)
    : Number(await getAppSetting(KEYS.pricePerPhoto, 1, conn));
  return {
    enabled: !!row?.quota_enabled,
    enabledAt: row?.enabled_at || null,
    freeLimit: Number(freeLimit),
    pricePerPhoto,
  };
}

async function getQuotaState(eventId, conn = db) {
  const settings = await getSettings(eventId, conn);
  const base = {
    enabled: settings.enabled,
    unlimited: false,
    freeLimit: settings.freeLimit,
    pricePerPhoto: settings.pricePerPhoto,
    total: null,
    used: 0,
    remaining: null,
    enabledAt: settings.enabledAt,
  };
  if (!settings.enabled) return base;

  const rows = await conn('event_photo_downloads').where({ event_id: eventId }).count({ count: '*' });
  const used = Number(rows?.[0]?.count || 0);

  const approved = await conn('download_quota_orders')
    .where({ event_id: eventId, status: 'approved' })
    .select('granted_photo_count', 'grants_unlimited');

  const unlimited = approved.some((o) => !!o.grants_unlimited);
  const granted = approved.reduce((sum, o) => sum + Number(o.granted_photo_count || 0), 0);
  const total = settings.freeLimit + granted;

  return {
    ...base,
    used,
    unlimited,
    total: unlimited ? null : total,
    remaining: unlimited ? null : Math.max(0, total - used),
  };
}

function normaliseIds(photoIds) {
  return [...new Set((photoIds || []).map(Number).filter(Number.isInteger))];
}

async function getDownloadedPhotoIds(eventId, conn = db) {
  return (await conn('event_photo_downloads').where({ event_id: eventId }).pluck('photo_id'))
    .map(Number);
}

async function checkAllowance(eventId, photoIds, conn = db) {
  const state = await getQuotaState(eventId, conn);
  const ids = normaliseIds(photoIds);
  if (!state.enabled || state.unlimited) {
    return { allowed: true, state, newPhotoIds: ids, missingSlots: 0 };
  }
  // A slot is spent per distinct photo, so anything already in the ledger is
  // free to fetch again and only the remainder is charged against the quota.
  const already = ids.length
    ? (await conn('event_photo_downloads').where({ event_id: eventId }).whereIn('photo_id', ids).pluck('photo_id'))
    : [];
  const alreadySet = new Set(already.map(Number));
  const newPhotoIds = ids.filter((id) => !alreadySet.has(id));
  const missingSlots = Math.max(0, newPhotoIds.length - state.remaining);
  return { allowed: missingSlots === 0, state, newPhotoIds, missingSlots };
}

function actorSnapshot(req) {
  const isCustomer = isPayingClient(req);
  return { type: isCustomer ? 'customer' : 'guest' };
}

function ledgerRows(eventId, ids, req) {
  return ids.map((photo_id) => ({
    event_id: eventId,
    photo_id,
    access_level: req?.accessLevel || null,
    actor: JSON.stringify(actorSnapshot(req)),
  }));
}

/**
 * Claim the slots a download is about to spend, BEFORE a single byte is sent.
 *
 * The order matters more than anything else in this file. Checking the
 * allowance and charging it after the transfer leaves a window in which every
 * concurrent request reads the same "one slot left" and every one of them
 * passes: a client with one slot could fire twenty parallel downloads from the
 * browser console and take all twenty. Claiming first closes that window,
 * because the second request reads a ledger the first has already written.
 *
 * The transaction takes a per-event advisory lock rather than `SELECT ... FOR
 * UPDATE` on the settings row, because that row does not have to exist: a NULL
 * column means "inherit the system default", and a gallery that never
 * configured anything has no row to lock at all. On SQLite the lock is skipped;
 * its write transactions already serialise.
 *
 * Returns the same shape checkAllowance does, plus `reserved`: the ledger rows
 * THIS call inserted. Photos already in the ledger conflict and never come
 * back, which is exactly what keeps a free re-download free when the caller
 * later releases what it could not deliver.
 */
async function reserveSlots(eventId, photoIds, req, conn = db) {
  return conn.transaction(async (trx) => {
    if (isPostgres(trx)) {
      await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [QUOTA_LOCK_NAMESPACE, Number(eventId)]);
    }

    const allowance = await checkAllowance(eventId, photoIds, trx);
    if (!allowance.allowed) return { ...allowance, reserved: [] };

    // An admin preview streams the archive but is not a client delivery, and a
    // gallery with the feature off keeps an empty ledger so switching the
    // feature on later starts from zero. Neither writes anything.
    if (!allowance.state.enabled || req?.isAdminPreview || allowance.newPhotoIds.length === 0) {
      return { ...allowance, reserved: [] };
    }

    const reserved = await trx('event_photo_downloads')
      .insert(ledgerRows(eventId, allowance.newPhotoIds, req))
      .onConflict(['event_id', 'photo_id'])
      .ignore()
      .returning(['id', 'photo_id']);

    return { ...allowance, reserved: Array.isArray(reserved) ? reserved : [] };
  });
}

/**
 * Refund the part of a claim that never reached the client: the response broke,
 * the client aborted, or a photo's source file was missing at archive time.
 *
 * It deletes by the ledger row's primary key, never by (event_id, photo_id).
 * That is the whole safety property. `reserved` holds only the rows this one
 * request inserted, because anything already in the ledger lost the ON CONFLICT
 * and never came back from `returning`. So a client re-downloading a photo they
 * bought weeks ago can fail as often as they like without ever refunding that
 * older slot.
 */
async function releaseReservation(reserved, deliveredPhotoIds, conn = db) {
  const rows = Array.isArray(reserved) ? reserved : [];
  if (rows.length === 0) return 0;

  const delivered = new Set(normaliseIds(deliveredPhotoIds));
  const stale = rows.filter((row) => !delivered.has(Number(row.photo_id))).map((row) => row.id);
  if (stale.length === 0) return 0;

  return conn('event_photo_downloads').whereIn('id', stale).delete();
}

async function assertDownloadAccess(req, eventId, conn = db) {
  const state = await getQuotaState(eventId, conn);
  if (!state.enabled) return { ok: true, state };
  if (req?.isAdminPreview) return { ok: true, state };
  if (!isPayingClient(req)) {
    return { ok: false, status: 403, code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST', state };
  }
  return { ok: true, state };
}

module.exports = {
  getQuotaState,
  checkAllowance,
  getDownloadedPhotoIds,
  isPayingClient,
  reserveSlots,
  releaseReservation,
  assertDownloadAccess,
};
