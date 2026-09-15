'use strict';

const { db } = require('../database/db');
const { getAppSetting } = require('../utils/appSettings');

const KEYS = {
  freeLimit: 'download_quota_default_free_limit',
  pricePerPhoto: 'download_quota_default_price_per_photo',
};

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

/**
 * Called only after the response actually finished, on the set of photos that
 * really made it into the transfer. A gallery with the feature off writes
 * nothing, so switching the feature on later starts from an empty ledger and
 * historical downloads are ignored. Switching it off and on again never clears
 * what is already there.
 */
async function recordDelivered(eventId, photoIds, req, conn = db) {
  const state = await getQuotaState(eventId, conn);
  if (!state.enabled) return 0;
  if (req?.isAdminPreview) return 0;
  const ids = normaliseIds(photoIds);
  if (!ids.length) return 0;

  const rows = ids.map((photo_id) => ({
    event_id: eventId,
    photo_id,
    access_level: req?.accessLevel || null,
    actor: JSON.stringify(actorSnapshot(req)),
  }));
  const inserted = await conn('event_photo_downloads')
    .insert(rows)
    .onConflict(['event_id', 'photo_id'])
    .ignore();
  return Array.isArray(inserted) ? inserted.length : 0;
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
  recordDelivered,
  assertDownloadAccess,
};
