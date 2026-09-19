'use strict';

const { db } = require('../../database/db');
const {
  assertDownloadAccess, reserveSlots, releaseReservation, checkAllowance, getQuotaState,
} = require('../../services/downloadQuotaService');
const { applyPhotoVisibilityFilter } = require('../../utils/photoVisibility');
const logger = require('../../utils/logger');

/**
 * The ids a "download everything" request would actually deliver to THIS
 * viewer: the same visibility and per-category filter the archive builder
 * applies further down downloads.js.
 *
 * It is duplicated rather than shared because the builder needs whole rows and
 * this needs only ids, and because the prebuilt-zip branch returns before the
 * builder's query ever runs. If the filter there changes, change it here too:
 * a mismatch would charge the client for photos they never received.
 */
async function deliverablePhotoIds(req) {
  const rows = await applyPhotoVisibilityFilter(
    db('photos')
      .leftJoin('photo_categories', 'photos.category_id', 'photo_categories.id')
      .where('photos.event_id', req.event.id)
      .where(function () {
        this.whereNull('photos.category_id')
          .orWhere('photo_categories.allow_downloads', true)
          .orWhereNull('photo_categories.allow_downloads');
      }),
    req.accessLevel
  ).select('photos.id');
  return rows.map((row) => Number(row.id));
}

/** Skip the extra query entirely while the gallery has no quota to enforce. */
async function quotaEnabled(eventId) {
  const state = await getQuotaState(eventId);
  return state.enabled;
}

function quotaRejection({ state, newPhotoIds, missingSlots }) {
  return {
    code: 'DOWNLOAD_QUOTA_EXCEEDED',
    quota: { total: state.total, used: state.used, remaining: state.remaining },
    requested_new: newPhotoIds.length,
    missing_slots: missingSlots,
  };
}

/**
 * Refuse the download because the quota could not be established.
 *
 * This gate USED to swallow its errors and let the download through, on the
 * reasoning that the quota was a billing aid rather than a security boundary.
 * The effect was that any error at all, a dropped connection or a migration
 * mid-flight, turned into unlimited free downloads, silently, for as long as
 * it lasted. That is the single outcome the feature exists to prevent, so the
 * gate now fails closed.
 *
 * Refusing costs less than it looks: every error reachable here is a database
 * error, and the handler downstream cannot read its own photo rows without the
 * same database. This turns a silent revenue leak into a visible 503, not a
 * working page into a broken one.
 */
function refuseUnavailable(res, req, error, where) {
  logger.error(`${where} quota gate failed, refusing the download`, {
    eventId: req.event?.id, error: error.message,
  });
  res.status(503).json({ code: 'DOWNLOAD_QUOTA_UNAVAILABLE' });
  return { ok: false, reserved: [] };
}

/**
 * One call per download path, kept in its own module so the upstream
 * downloads.js only gains a single line at each of its four entry points and
 * stays easy to rebase.
 *
 * Returns { ok, reserved }. When ok is false the response has already been
 * sent, so the caller must return immediately. When it is true, `reserved` are
 * the ledger rows this request claimed UP FRONT: the slots are already spent,
 * and the caller owes the client a refund for whatever it fails to deliver.
 * Charging after the transfer instead is what let a client with one slot left
 * fire twenty parallel downloads and take all twenty.
 */
async function passesQuotaGate(req, res, photoIds, { reserve = true } = {}) {
  try {
    const access = await assertDownloadAccess(req, req.event.id);
    if (!access.ok) {
      res.status(access.status).json({ code: access.code });
      return { ok: false, reserved: [] };
    }
    if (!access.state.enabled) return { ok: true, reserved: [] };

    const claim = reserve
      ? await reserveSlots(req.event.id, photoIds, req)
      : await checkAllowance(req.event.id, photoIds);
    if (!claim.allowed) {
      res.status(402).json(quotaRejection(claim));
      return { ok: false, reserved: [] };
    }
    return { ok: true, reserved: claim.reserved || [] };
  } catch (error) {
    return refuseUnavailable(res, req, error, 'Download');
  }
}

/**
 * The whole-gallery variant. Resolves the deliverable ids itself, and only when
 * the gallery actually has a quota, so an install that never switched the
 * feature on pays nothing for it.
 *
 * Returns { ok, photoIds, reserved }. When ok is false the response has already
 * been sent.
 */
async function passesWholeGalleryGate(req, res, options) {
  try {
    if (!(await quotaEnabled(req.event.id))) return { ok: true, photoIds: null, reserved: [] };
    const photoIds = await deliverablePhotoIds(req);
    const gate = await passesQuotaGate(req, res, photoIds, options);
    return { ...gate, photoIds };
  } catch (error) {
    return { ...refuseUnavailable(res, req, error, 'Whole gallery'), photoIds: null };
  }
}

/**
 * Refund, once the response is over, whatever the gate claimed but the transfer
 * never actually handed over.
 *
 * Hooked to 'close' rather than 'finish' on purpose: 'finish' means the body was
 * written in full, so it never fires for a client who cancels a large archive
 * halfway. With the allowance now charged up front, that silence would cost the
 * client every slot the request asked for. 'close' fires on both outcomes, and
 * `writableFinished` is what tells them apart.
 *
 * `deliveredIds` is a function, not an array, because the archive paths only
 * learn which photos made it in while they are streaming: a photo whose source
 * file was missing on disk never reached the client and must be refunded.
 */
function settleReservation(res, req, reserved, deliveredIds) {
  if (!Array.isArray(reserved) || reserved.length === 0) return;

  let settled = false;
  res.on('close', () => {
    if (settled) return;
    settled = true;

    const complete = res.writableFinished && res.statusCode < 400;
    const delivered = complete ? (deliveredIds() || []) : [];
    releaseReservation(reserved, delivered).catch((error) => {
      // Never silent. A refund that fails leaves the client charged for photos
      // they did not get, and the only way anyone finds out is this line.
      logger.error('Download quota refund failed, the client is over-charged', {
        eventId: req.event?.id,
        reservedPhotoIds: reserved.map((row) => row.photo_id),
        error: error.message,
      });
    });
  });
}

module.exports = {
  quotaRejection,
  passesQuotaGate,
  passesWholeGalleryGate,
  deliverablePhotoIds,
  settleReservation,
};
