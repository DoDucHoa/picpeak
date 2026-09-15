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

module.exports = { getQuotaState, checkAllowance, getDownloadedPhotoIds, isPayingClient };
