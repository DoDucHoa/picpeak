'use strict';

const express = require('express');
const { verifyGalleryAccess, denySlideshowToken } = require('../../middleware/gallery');
const { blockHiddenGallery } = require('../../utils/revealMode');
const { getQuotaState, getDownloadedPhotoIds, isPayingClient } = require('../../services/downloadQuotaService');
const { resolvePackages, decoratePackage } = require('../../services/downloadPackagePricing');
const orderService = require('../../services/downloadOrderService');
const { getProfile } = require('../../services/businessProfileService');
const logger = require('../../utils/logger');

// Currency lives on business_profile.default_currency, the same source the admin
// dashboard reads. It is NOT an app_settings key; do not invent one, or the
// gallery will quote prices in a different currency from every invoice.
//
// getProfile() resolves to { profile, bankAccounts }, NOT the profile itself.
// Reading default_currency off the wrapper yields undefined and every gallery
// silently falls back to CHF, which is the kind of bug nobody reports because
// the page still renders.
async function resolveCurrency() {
  try {
    const { profile } = await getProfile();
    return String(profile?.default_currency || 'CHF').toUpperCase();
  } catch (_) {
    return 'CHF';
  }
}

const router = express.Router();
const gate = [verifyGalleryAccess, denySlideshowToken, blockHiddenGallery];

// One call feeds all three client-side surfaces: the badge, the "already
// downloaded" markers on the grid, and the package list. Three separate
// endpoints would triple the round trips for one screen.
router.get('/:slug/download-quota', ...gate, async (req, res) => {
  try {
    const eventId = req.event.id;
    const quota = await getQuotaState(eventId);
    const [downloaded, packages, pendingOrder, currency] = await Promise.all([
      quota.enabled ? getDownloadedPhotoIds(eventId) : Promise.resolve([]),
      quota.enabled ? resolvePackages(eventId) : Promise.resolve([]),
      quota.enabled ? orderService.getPendingOrder(eventId) : Promise.resolve(null),
      resolveCurrency(),
    ]);
    res.json({
      quota,
      downloaded_photo_ids: downloaded,
      packages: packages.map((p) => decoratePackage(p, quota.pricePerPhoto)),
      pending_order: pendingOrder,
      currency,
    });
  } catch (error) {
    logger.error('Failed to read download quota', { error: error.message });
    res.status(500).json({ error: 'Failed to read download quota' });
  }
});

router.post('/:slug/download-orders', ...gate, async (req, res) => {
  if (!isPayingClient(req)) {
    return res.status(403).json({ code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' });
  }
  const packageId = Number(req.body?.package_id);
  if (!Number.isInteger(packageId)) {
    return res.status(400).json({ error: 'package_id is required' });
  }
  try {
    const order = await orderService.createOrder({
      eventId: req.event.id, packageId, req, origin: 'client',
    });
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof orderService.PendingOrderExistsError) {
      return res.status(409).json({ code: 'PENDING_ORDER_EXISTS' });
    }
    // A package id the client sent that no longer resolves is a bad request, not
    // a server fault. Without this branch it leaves as a 500 and the dialog shows
    // an outage where the real answer is "that package is gone, reload".
    if (error instanceof orderService.UnknownPackageError) {
      return res.status(400).json({ code: 'UNKNOWN_PACKAGE' });
    }
    logger.error('Failed to create download order', { error: error.message });
    res.status(500).json({ error: 'Failed to create download order' });
  }
});

module.exports = router;
