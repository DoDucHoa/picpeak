/**
 * Reveal mode (#838) is removed (event form redesign P3, spec 5.12): no
 * gallery is hidden any more, whatever its stored reveal_mode says. The module
 * and its exports stay, so every gate that calls it keeps working as a no-op
 * and the suites that mock it keep their shape. The columns keep their values,
 * so a rollback is a code revert.
 */

/** Whether the gallery is hidden from plain guests: never, since P3. */
function isGalleryHidden() {
  return false;
}

/**
 * Which access levels see the full gallery while it is hidden:
 * the live slideshow (the "surprise beamer" case), client access and
 * customer-portal-minted tokens (both are the host/customer reviewing
 * their own event — those tokens carry via:'customer' with NO accessLevel,
 * so accessLevel alone would misclassify them as guests) and the admin
 * preview.
 */
function bypassesReveal(req) {
  if (req.accessLevel === 'slideshow' || req.accessLevel === 'client') return true;
  if (req.viaCustomer) return true;
  // req.isAdminPreview is set by verifyAdminPreview() only after the full
  // session check (revocation, deactivation, password change). Re-decoding
  // the token here would re-grant the bypass to a session that check just
  // rejected.
  return req.isAdminPreview === true;
}

/** Route guard result: is THIS request blocked by reveal mode? */
function guestBlockedByReveal(req, now = new Date()) {
  return isGalleryHidden(req.event, now) && !bypassesReveal(req);
}

/**
 * Route guard: hard 403 for plain guests on photo/derivative/download
 * endpoints while the gallery is hidden. Photo IDs are sequential, so
 * gating only the listing would leave images probeable. Mount AFTER
 * verifyGalleryAccess (needs req.event / req.accessLevel).
 */
function blockHiddenGallery(req, res, next) {
  if (guestBlockedByReveal(req)) {
    return res.status(403).json({ error: 'Gallery is hidden until reveal', code: 'GALLERY_HIDDEN' });
  }
  next();
}

module.exports = { isGalleryHidden, bypassesReveal, guestBlockedByReveal, blockHiddenGallery };
