const { AppError } = require('../utils/errors');

/**
 * The photo source a new event starts with (spec 5.5): managed, or an
 * external folder, optionally watched. The same rules as the event PUT: a
 * folder is required in reference mode, managed clears both, and turning the
 * watcher on needs photos.upload, because the server then imports on the
 * admin's behalf. A new event has no earlier state, so asking for the watcher
 * is always a transition. canEnableWatch is only called when it is asked for.
 */
async function resolveCreatePhotoSource(input, { canEnableWatch }) {
  if (input.source_mode !== 'reference') {
    return { source_mode: 'managed', external_path: null, external_watch: false };
  }
  const externalPath = typeof input.external_path === 'string' ? input.external_path.trim() : '';
  if (!externalPath) {
    throw new AppError('external_path is required when source_mode is reference', 400, 'EXTERNAL_PATH_REQUIRED');
  }
  const watch = input.external_watch === true || input.external_watch === 'true';
  if (watch && !(await canEnableWatch())) {
    throw new AppError('The photos.upload permission is required to enable automatic imports for this folder', 403, 'PHOTOS_UPLOAD_REQUIRED');
  }
  return { source_mode: 'reference', external_path: externalPath, external_watch: watch };
}

module.exports = { resolveCreatePhotoSource };
