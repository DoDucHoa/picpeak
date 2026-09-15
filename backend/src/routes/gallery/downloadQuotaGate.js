'use strict';

const { db } = require('../../database/db');
const { assertDownloadAccess, checkAllowance, getQuotaState } = require('../../services/downloadQuotaService');
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
 * One call per download path, kept in its own module so the upstream
 * downloads.js only gains a single line at each of its four entry points and
 * stays easy to rebase.
 *
 * Returns true when the handler may continue. When it returns false the
 * response has already been sent, so the caller must return immediately.
 *
 * Failing open is deliberate: a gallery that has never switched the feature on
 * must behave exactly as it did before, and an unexpected error here should not
 * take downloads offline for everyone. The quota is a billing aid, not a
 * security boundary.
 */
async function passesQuotaGate(req, res, photoIds) {
  try {
    const access = await assertDownloadAccess(req, req.event.id);
    if (!access.ok) {
      res.status(access.status).json({ code: access.code });
      return false;
    }
    if (!access.state.enabled) return true;

    const allowance = await checkAllowance(req.event.id, photoIds);
    if (!allowance.allowed) {
      res.status(402).json(quotaRejection(allowance));
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Download quota gate failed, allowing the download', {
      eventId: req.event?.id, error: error.message,
    });
    return true;
  }
}

/**
 * The whole-gallery variant. Resolves the deliverable ids itself, and only when
 * the gallery actually has a quota, so an install that never switched the
 * feature on pays nothing for it.
 *
 * Returns { ok, photoIds }. When ok is false the response has already been sent.
 */
async function passesWholeGalleryGate(req, res) {
  try {
    if (!(await quotaEnabled(req.event.id))) return { ok: true, photoIds: null };
    const photoIds = await deliverablePhotoIds(req);
    const ok = await passesQuotaGate(req, res, photoIds);
    return { ok, photoIds };
  } catch (error) {
    logger.error('Whole gallery quota gate failed, allowing the download', {
      eventId: req.event?.id, error: error.message,
    });
    return { ok: true, photoIds: null };
  }
}

module.exports = { quotaRejection, passesQuotaGate, passesWholeGalleryGate, deliverablePhotoIds };
