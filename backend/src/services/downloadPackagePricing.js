'use strict';

const { db } = require('../database/db');

/**
 * Savings are DERIVED from the configured per photo price, never typed in by
 * hand, so an advertised percentage can never drift away from what the package
 * actually costs. A package at or above the per photo price advertises nothing:
 * "save 0%" is a claim with no content. `price` and `price_per_photo` arrive
 * from postgres as decimal strings, hence the explicit Number() coercion.
 */
function decoratePackage(pkg, pricePerPhoto) {
  const unitPrice = Number(pricePerPhoto);
  const price = Number(pkg.price);
  let savings = null;

  // An unlimited package has no photo count, so there is no list price to
  // compare it against.
  if (pkg.kind === 'quantity' && pkg.photo_count > 0 && unitPrice > 0) {
    const listPrice = pkg.photo_count * unitPrice;
    const pct = Math.round((1 - price / listPrice) * 100);
    savings = pct > 0 ? pct : null;
  }

  return {
    ...pkg,
    savings_percent: savings,
    auto_label: { count: pkg.photo_count, price, savings_percent: savings },
  };
}

/**
 * Per-event rows REPLACE the global list rather than merging with it. Merging
 * would leave no way to remove one global package from a single gallery.
 */
async function resolvePackages(eventId, conn = db) {
  const own = await conn('download_packages')
    .where({ event_id: eventId, is_active: true })
    .orderBy('sort_order', 'asc');
  if (own.length) return own;
  return conn('download_packages')
    .whereNull('event_id').where({ is_active: true })
    .orderBy('sort_order', 'asc');
}

module.exports = { resolvePackages, decoratePackage };
