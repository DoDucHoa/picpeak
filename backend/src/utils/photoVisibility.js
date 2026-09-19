/**
 * Shared hidden-photo access control.
 *
 * PicPeak photos carry a `visibility` column: 'visible' (or NULL, for
 * pre-migration rows) is shown to everyone; 'hidden' is client-only. A
 * gallery viewer's `req.accessLevel` is 'client' for a PIN-client login and
 * something else ('guest'/'slideshow'/…) for an ordinary guest.
 *
 * The main photo-list query and the single-photo download/view routes each
 * enforced this inline, but several bulk/secure paths (download-all,
 * download-selected, protected-image view, signed-URL mint, secure-token
 * mint, secure-download) shipped without it — letting ordinary guests reach
 * hidden/client-only photos. These helpers centralise the rule so every
 * sink applies exactly the same predicate.
 */

// PIN-clients see hidden photos; everyone else does not.
function canSeeHiddenPhotos(accessLevel) {
  return accessLevel === 'client';
}

/**
 * Append the guest visibility filter to a knex `photos` query. No-op for
 * clients. NULL visibility is treated as visible (pre-migration default).
 * The query must reference the table as `photos` (all call sites do).
 */
function applyPhotoVisibilityFilter(query, accessLevel) {
  if (canSeeHiddenPhotos(accessLevel)) return query;
  return query.where(function () {
    this.where('photos.visibility', 'visible').orWhereNull('photos.visibility');
  });
}

/**
 * Single-photo predicate: true when this photo must be blocked for a viewer
 * at the given access level. Mirrors the inline guards in gallery.js.
 */
function isPhotoHiddenFromViewer(photo, accessLevel) {
  return !!photo && photo.visibility === 'hidden' && !canSeeHiddenPhotos(accessLevel);
}

/**
 * The photos a download would actually deliver to a viewer of this gallery.
 *
 * Two rules, and they are easy to get subtly wrong apart from each other. A
 * photo is excluded when its category has switched downloads off (#640); a
 * photo with no category, or in a category predating the column, is included,
 * which is why the join is a LEFT one and why NULL counts as allowed. On top of
 * that sits the ordinary visibility filter, so a guest never sees a hidden
 * photo and a client always does.
 *
 * It lives here, and returns the query rather than its rows, because the caller
 * decides what to select: the quota gate prices the download off `photos.id`,
 * the archive builder fills it off `photos.*` with its own ordering. That is
 * the whole reason this is one function. It used to be two copies with a
 * comment between them asking whoever edited one to edit the other, and a
 * divergence there charges the client for photos they never receive.
 *
 * `conn` is a parameter so this module keeps no connection of its own, the same
 * way the rest of the file takes the query it is given.
 */
function downloadablePhotosQuery(eventId, accessLevel, conn) {
  return applyPhotoVisibilityFilter(
    conn('photos')
      .leftJoin('photo_categories', 'photos.category_id', 'photo_categories.id')
      .where('photos.event_id', eventId)
      .where(function () {
        this.whereNull('photos.category_id')
          .orWhere('photo_categories.allow_downloads', true)
          .orWhereNull('photo_categories.allow_downloads');
      }),
    accessLevel
  );
}

module.exports = {
  canSeeHiddenPhotos,
  applyPhotoVisibilityFilter,
  isPhotoHiddenFromViewer,
  downloadablePhotosQuery,
};
