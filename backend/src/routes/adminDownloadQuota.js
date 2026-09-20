'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { requireEventOwnership, scopeEventsQuery } = require('../middleware/ownership');
const { db } = require('../database/db');
const { getQuotaState } = require('../services/downloadQuotaService');
const { decoratePackage, resolvePackages } = require('../services/downloadPackagePricing');
const orderService = require('../services/downloadOrderService');
const { getProfile } = require('../services/businessProfileService');
const logger = require('../utils/logger');

const router = express.Router();

const SETTINGS_TABLE = 'event_download_quota_settings';
const PACKAGES_TABLE = 'download_packages';
const LEDGER_TABLE = 'event_photo_downloads';
const ORDERS_TABLE = 'download_quota_orders';

const READ = requirePermission('events.view');
const WRITE = requirePermission('events.edit');

/**
 * Currency comes from business_profile.default_currency, the same column every
 * invoice reads. getProfile() answers { profile, bankAccounts }, so the column
 * is one level down: reading default_currency off the wrapper yields undefined
 * and every price silently falls back to CHF, which nobody reports because the
 * page still renders.
 */
async function resolveCurrency() {
  try {
    const { profile } = await getProfile();
    return String(profile?.default_currency || 'CHF').toUpperCase();
  } catch (_) {
    return 'CHF';
  }
}

/** The global price list is the rows with a NULL event_id, which `where` cannot express. */
function scopePackages(query, eventId) {
  return eventId == null ? query.whereNull('event_id') : query.where({ event_id: eventId });
}

function parsePaging(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const page = Math.max(Number(query.page) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

/**
 * Empty means "inherit the system default", and that is NOT the same as zero:
 * zero would mean this gallery grants no free download at all. Store null, and
 * only when the field was actually sent, so a PUT carrying one field never
 * wipes the other.
 */
function readNullableNumber(body, field) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return undefined;
  const raw = body[field];
  if (raw === '' || raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function validatePackages(packages) {
  if (!Array.isArray(packages)) return 'packages must be an array';
  for (const pkg of packages) {
    if (!pkg || typeof pkg !== 'object') return 'each package must be an object';
    const kind = pkg.kind || 'quantity';
    if (kind !== 'quantity' && kind !== 'unlimited') return `unknown package kind ${kind}`;
    const price = Number(pkg.price);
    if (!Number.isFinite(price) || price < 0) return 'each package needs a price of zero or more';
    if (kind === 'quantity' && !(Number(pkg.photo_count) > 0)) {
      return 'a quantity package needs a photo_count above zero';
    }
  }
  return null;
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

/**
 * Write the price list of one scope, global or per event. A package the
 * photographer dropped from the list is deactivated rather than deleted:
 * download_quota_orders points at it, and the history of what was sold has to
 * survive an edit of the price list.
 */
async function savePackageList(eventId, packages, conn = db) {
  const existing = await scopePackages(conn(PACKAGES_TABLE), eventId).select('id');
  const existingIds = existing.map((row) => Number(row.id));
  const kept = new Set();
  const now = new Date();

  for (let index = 0; index < packages.length; index += 1) {
    const pkg = packages[index];
    const kind = pkg.kind || 'quantity';
    const values = {
      kind,
      photo_count: kind === 'unlimited' ? null : Number(pkg.photo_count),
      price: Number(pkg.price),
      name_i18n: pkg.name_i18n ? JSON.stringify(pkg.name_i18n) : null,
      sort_order: Number.isFinite(Number(pkg.sort_order)) ? Number(pkg.sort_order) : index,
      is_active: pkg.is_active === false ? false : true,
      updated_at: now,
    };

    const id = Number(pkg.id);
    if (Number.isInteger(id) && existingIds.includes(id)) {
      await conn(PACKAGES_TABLE).where({ id }).update(values);
      kept.add(id);
    } else {
      // `.returning('id')` is not decoration: without it knex hands back no row
      // on Postgres, the new id is lost and the row would be deactivated again
      // one line below as if it had been dropped.
      const inserted = await conn(PACKAGES_TABLE)
        .insert({ ...values, event_id: eventId ?? null, created_at: now })
        .returning('id');
      const newId = Number(inserted?.[0]?.id ?? inserted?.[0]);
      if (Number.isInteger(newId)) kept.add(newId);
    }
  }

  const dropped = existingIds.filter((id) => !kept.has(id));
  if (dropped.length) {
    await conn(PACKAGES_TABLE).whereIn('id', dropped).update({ is_active: false, updated_at: now });
  }
  return dropped.length;
}

/**
 * `resolved` switches from "this gallery's own list, empty means empty" (the
 * edit tab's contract, see the route comment below) to "what a customer of
 * this gallery would actually be offered": the gallery's own active
 * packages, falling back to the global list exactly the way the customer-
 * facing quota endpoint already resolves them. The "Create order for client"
 * modal needs the second one: a gallery that never set its own price list
 * still has to be able to grant the global packages, not see an empty picker.
 */
async function listPackages(eventId, res, { resolved = false } = {}) {
  const rows = resolved && eventId != null
    ? await resolvePackages(eventId)
    : await scopePackages(db(PACKAGES_TABLE), eventId).orderBy('sort_order', 'asc');
  const [currency, quota] = await Promise.all([
    resolveCurrency(),
    eventId == null ? Promise.resolve(null) : getQuotaState(eventId),
  ]);
  const pricePerPhoto = quota?.pricePerPhoto;
  res.json({
    packages: (rows || []).map((row) => {
      const pkg = { ...row, name_i18n: parseJson(row.name_i18n) };
      return pricePerPhoto ? decoratePackage(pkg, pricePerPhoto) : pkg;
    }),
    currency,
  });
}

// GET /api/admin/events/:id/download-quota
// The settings card reads the live state plus the raw per-event row, because a
// NULL column has to stay visibly empty in the form rather than showing the
// inherited number as if the photographer had typed it.
router.get('/events/:id/download-quota', adminAuth, READ, requireEventOwnership, async (req, res) => {
  const eventId = Number(req.params.id);
  try {
    const [quota, settings, pendingOrder, currency] = await Promise.all([
      getQuotaState(eventId),
      db(SETTINGS_TABLE).where({ event_id: eventId }).first(),
      orderService.getPendingOrder(eventId),
      resolveCurrency(),
    ]);
    res.json({
      quota,
      settings: settings || null,
      pending_order: pendingOrder || null,
      currency,
    });
  } catch (error) {
    logger.error('Failed to read admin download quota', { eventId, error: error.message });
    res.status(500).json({ error: 'Failed to read download quota' });
  }
});

// PUT /api/admin/events/:id/download-quota
// Body: { quota_enabled?, free_limit?, price_per_photo?, auto_approve? }
router.put('/events/:id/download-quota', adminAuth, WRITE, requireEventOwnership, async (req, res) => {
  const eventId = Number(req.params.id);
  const body = req.body || {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'quota_enabled')) {
    patch.quota_enabled = body.quota_enabled === true || body.quota_enabled === 'true';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'auto_approve')) {
    patch.auto_approve = body.auto_approve === true || body.auto_approve === 'true';
  }
  const freeLimit = readNullableNumber(body, 'free_limit');
  if (freeLimit !== undefined) patch.free_limit = freeLimit;
  const pricePerPhoto = readNullableNumber(body, 'price_per_photo');
  if (pricePerPhoto !== undefined) patch.price_per_photo = pricePerPhoto;

  try {
    const existing = await db(SETTINGS_TABLE).where({ event_id: eventId }).first();
    const now = new Date();
    // enabled_at stamps the first time the feature was switched on and is never
    // cleared. Switching the feature off writes quota_enabled=false and nothing
    // else: event_photo_downloads is NOT touched here, ever. Clearing the ledger
    // to leave a "clean" gallery would let two flicks of the switch hand every
    // photo back for free.
    if (patch.quota_enabled === true && !existing?.enabled_at) patch.enabled_at = now;

    if (existing) {
      if (Object.keys(patch).length) {
        await db(SETTINGS_TABLE).where({ event_id: eventId }).update({ ...patch, updated_at: now });
      }
    } else {
      await db(SETTINGS_TABLE).insert({
        event_id: eventId,
        ...patch,
        created_at: now,
        updated_at: now,
      });
    }

    const [settings, quota] = await Promise.all([
      db(SETTINGS_TABLE).where({ event_id: eventId }).first(),
      getQuotaState(eventId),
    ]);
    res.json({ quota, settings: settings || null });
  } catch (error) {
    logger.error('Failed to save download quota settings', { eventId, error: error.message });
    res.status(500).json({ error: 'Failed to save download quota settings' });
  }
});

// GET /api/admin/events/:id/download-ledger?page=&limit=
router.get('/events/:id/download-ledger', adminAuth, READ, requireEventOwnership, async (req, res) => {
  const eventId = Number(req.params.id);
  const { limit, page, offset } = parsePaging(req.query || {});
  try {
    const counted = await db(LEDGER_TABLE).where({ event_id: eventId }).count({ count: '*' });
    // A left join, because the ledger row deliberately outlives the photo it
    // refers to: a deleted photo still occupies its slot and must still be listed.
    const items = await db(`${LEDGER_TABLE} as d`)
      .leftJoin('photos as p', 'p.id', 'd.photo_id')
      .where('d.event_id', eventId)
      .orderBy('d.first_downloaded_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select(
        'd.id',
        'd.photo_id',
        'd.first_downloaded_at',
        'd.access_level',
        'p.filename',
        'p.thumbnail_path',
      );
    res.json({ items, total: Number(counted?.[0]?.count || 0), page, limit });
  } catch (error) {
    logger.error('Failed to read download ledger', { eventId, error: error.message });
    res.status(500).json({ error: 'Failed to read download ledger' });
  }
});

// POST /api/admin/events/:id/download-orders
// The photographer places an order on the client's behalf, for instance after
// agreeing an extension over the phone.
router.post('/events/:id/download-orders', adminAuth, WRITE, requireEventOwnership, async (req, res) => {
  const eventId = Number(req.params.id);
  const packageId = Number(req.body?.package_id);
  if (!Number.isInteger(packageId)) {
    return res.status(400).json({ error: 'package_id is required' });
  }
  // A goodwill grant needs a reason on the record, the same way a rejection
  // does: this order was never paid for through PicPeak, so whoever reviews it
  // later needs to know why it exists.
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    return res.status(400).json({ code: 'REASON_REQUIRED' });
  }
  try {
    const order = await orderService.createOrder({
      eventId,
      packageId,
      req,
      origin: 'photographer',
      reason,
    });
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof orderService.PendingOrderExistsError) {
      return res.status(409).json({ code: 'PENDING_ORDER_EXISTS' });
    }
    if (error instanceof orderService.UnknownPackageError) {
      return res.status(400).json({ code: 'UNKNOWN_PACKAGE' });
    }
    logger.error('Failed to create download order as admin', { eventId, error: error.message });
    res.status(500).json({ error: 'Failed to create download order' });
  }
});

// GET /api/admin/download-orders?status=pending&page=&limit=
router.get('/download-orders', adminAuth, READ, async (req, res) => {
  const { limit, page, offset } = parsePaging(req.query || {});
  const status = req.query?.status;
  try {
    // requireEventOwnership cannot run here: there is no :id to check, so the
    // same rule is applied as a predicate on the join instead.
    const base = () => {
      let query = db(`${ORDERS_TABLE} as o`).join('events as e', 'e.id', 'o.event_id');
      query = scopeEventsQuery(query, req.admin, 'e.created_by');
      if (status) query = query.where('o.status', status);
      return query;
    };
    const counted = await base().count({ count: 'o.id' });
    const items = await base()
      .orderBy('o.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('o.*', 'e.event_name', 'e.slug');
    res.json({ items, total: Number(counted?.[0]?.count || 0), page, limit });
  } catch (error) {
    logger.error('Failed to list download orders', { error: error.message });
    res.status(500).json({ error: 'Failed to list download orders' });
  }
});

// POST /api/admin/download-orders/:orderId/approve
// Body: { granted_photo_count? } overrides what the package asked for.
router.post('/download-orders/:orderId/approve', adminAuth, WRITE, async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Invalid order id' });

  const raw = req.body?.granted_photo_count;
  let grantedPhotoCount;
  if (raw !== undefined && raw !== null && raw !== '') {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ error: 'granted_photo_count must be a whole number of photos' });
    }
    grantedPhotoCount = value;
  }

  try {
    const order = await orderService.approveOrder({ orderId, adminId: req.admin?.id, grantedPhotoCount });
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.InvalidTransitionError) {
      return res.status(409).json({ code: 'INVALID_ORDER_TRANSITION', error: error.message });
    }
    logger.error('Failed to approve download order', { orderId, error: error.message });
    res.status(500).json({ error: 'Failed to approve download order' });
  }
});

// POST /api/admin/download-orders/:orderId/reject
// Body: { reason } is mandatory: the client is shown it.
router.post('/download-orders/:orderId/reject', adminAuth, WRITE, async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Invalid order id' });

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });

  try {
    const order = await orderService.rejectOrder({ orderId, adminId: req.admin?.id, reason });
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.InvalidTransitionError) {
      return res.status(409).json({ code: 'INVALID_ORDER_TRANSITION', error: error.message });
    }
    logger.error('Failed to reject download order', { orderId, error: error.message });
    res.status(500).json({ error: 'Failed to reject download order' });
  }
});

// GET, PUT /api/admin/download-packages: the global price list.
router.get('/download-packages', adminAuth, READ, async (req, res) => {
  try {
    await listPackages(null, res);
  } catch (error) {
    logger.error('Failed to read global download packages', { error: error.message });
    res.status(500).json({ error: 'Failed to read download packages' });
  }
});

router.put('/download-packages', adminAuth, WRITE, async (req, res) => {
  const packages = req.body?.packages;
  const invalid = validatePackages(packages);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const deactivated = await savePackageList(null, packages);
    res.json({ saved: packages.length, deactivated });
  } catch (error) {
    logger.error('Failed to save global download packages', { error: error.message });
    res.status(500).json({ error: 'Failed to save download packages' });
  }
});

// GET, PUT /api/admin/events/:id/download-packages: one gallery's own price
// list, which REPLACES the global one rather than merging with it.
router.get('/events/:id/download-packages', adminAuth, READ, requireEventOwnership, async (req, res) => {
  try {
    const resolved = req.query.resolved === 'true';
    await listPackages(Number(req.params.id), res, { resolved });
  } catch (error) {
    logger.error('Failed to read event download packages', { eventId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to read download packages' });
  }
});

router.put('/events/:id/download-packages', adminAuth, WRITE, requireEventOwnership, async (req, res) => {
  const packages = req.body?.packages;
  const invalid = validatePackages(packages);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const deactivated = await savePackageList(Number(req.params.id), packages);
    res.json({ saved: packages.length, deactivated });
  } catch (error) {
    logger.error('Failed to save event download packages', { eventId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to save download packages' });
  }
});

// POST /api/admin/download-packages/import
// Body: { packages: [ { id, name: { en, de, vi } } ] }
// Matching is by id. An id that does not exist is skipped, and the count of
// both is reported back: a half applied import that answers a plain 200 is how
// a photographer ends up believing every translation landed.
router.post('/download-packages/import', adminAuth, WRITE, async (req, res) => {
  const packages = req.body?.packages;
  if (!Array.isArray(packages)) {
    return res.status(400).json({ error: 'The import file needs a "packages" array' });
  }

  const entries = [];
  for (const entry of packages) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Every package in the import file needs a numeric id' });
    }
    if (!entry.name || typeof entry.name !== 'object' || Array.isArray(entry.name)) {
      return res.status(400).json({ error: `Package ${id} needs a "name" object keyed by locale` });
    }
    entries.push({ id, name: entry.name });
  }

  try {
    const known = await db(PACKAGES_TABLE).whereIn('id', entries.map((e) => e.id)).select('id');
    const knownIds = new Set((known || []).map((row) => Number(row.id)));
    const now = new Date();
    const skippedIds = [];
    let imported = 0;

    for (const entry of entries) {
      if (!knownIds.has(entry.id)) {
        skippedIds.push(entry.id);
        continue;
      }
      await db(PACKAGES_TABLE)
        .where({ id: entry.id })
        .update({ name_i18n: JSON.stringify(entry.name), updated_at: now });
      imported += 1;
    }

    res.json({ imported, skipped: skippedIds.length, skipped_ids: skippedIds });
  } catch (error) {
    logger.error('Failed to import download package names', { error: error.message });
    res.status(500).json({ error: 'Failed to import download package names' });
  }
});

module.exports = router;
