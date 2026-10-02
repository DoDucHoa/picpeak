const crypto = require('crypto');

/**
 * Download bundles: a selection split into ZIP parts the browser collects one
 * by one (routes/gallery/downloads.js).
 *
 * A part is at most PART_BYTES of stored file size, so no archive grows past
 * what a phone, an old USB stick or an unzip tool handles comfortably. A
 * single photo larger than that gets a part of its own rather than being
 * refused.
 *
 * Parts are held in memory. The backend runs as one process, a part is only
 * useful for the minutes between planning it and collecting it, and a token
 * lost to a restart answers 404, which the client reports as a failed
 * download the guest can simply retry.
 */

const DEFAULT_PART_BYTES = 2 * 1024 * 1024 * 1024;
const TTL_MS = 60 * 60 * 1000;
// One gallery's worth of ids in a single request, with headroom. Above this a
// request is far more likely to be abuse than a real selection.
const MAX_PHOTOS = 20000;
// A ceiling on what the map can hold, so a stream of planning requests can
// never grow it without bound. The oldest parts go first.
const MAX_PARTS = 5000;

const parts = new Map();

function partBytes() {
  const configured = parseInt(process.env.DOWNLOAD_BUNDLE_PART_BYTES, 10);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PART_BYTES;
}

/**
 * Group photos, in the order given, into runs whose stored sizes add up to at
 * most `limit`. A photo with no recorded size counts as zero: the stored size
 * only steers the split, and the archive itself streams whatever is there.
 */
function splitBySize(photos, limit) {
  const groups = [];
  let current = [];
  let currentBytes = 0;
  for (const photo of photos) {
    const size = Math.max(0, Number(photo.size_bytes) || 0);
    if (current.length > 0 && currentBytes + size > limit) {
      groups.push({ photoIds: current, sizeBytes: currentBytes });
      current = [];
      currentBytes = 0;
    }
    current.push(photo.id);
    currentBytes += size;
  }
  if (current.length > 0) groups.push({ photoIds: current, sizeBytes: currentBytes });
  return groups;
}

function purge(now) {
  for (const [token, part] of parts) {
    if (part.expiresAt <= now) parts.delete(token);
  }
  // Map iteration follows insertion order, so the first keys are the oldest.
  while (parts.size > MAX_PARTS) {
    parts.delete(parts.keys().next().value);
  }
}

/**
 * Plan the parts for `photos` ({ id, size_bytes }) and remember them. Returns
 * what the client needs to collect them, in order.
 */
function createBundle({ eventId, scope, photos, resolution }) {
  const now = Date.now();
  const groups = splitBySize(photos, partBytes());
  const planned = groups.map((group, i) => {
    const token = crypto.randomBytes(24).toString('base64url');
    parts.set(token, {
      eventId,
      scope,
      resolution: typeof resolution === 'string' ? resolution : undefined,
      photoIds: group.photoIds,
      index: i + 1,
      count: groups.length,
      expiresAt: now + TTL_MS,
    });
    return { token, photo_count: group.photoIds.length, size_bytes: group.sizeBytes };
  });
  purge(now);
  return planned;
}

function getPart(token) {
  if (typeof token !== 'string') return null;
  const part = parts.get(token);
  if (!part) return null;
  if (part.expiresAt <= Date.now()) {
    parts.delete(token);
    return null;
  }
  return part;
}

module.exports = {
  MAX_PHOTOS,
  createBundle,
  getPart,
  splitBySize,
  _reset: () => parts.clear(),
};
