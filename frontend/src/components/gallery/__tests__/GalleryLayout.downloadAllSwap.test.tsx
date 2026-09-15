/**
 * When "Download all" turns into an offer to buy.
 *
 * The comparison is photos NOT YET delivered against slots left. Two other
 * comparisons look plausible and are both wrong:
 *
 *   - gallery size against the free limit, which never learns that the client
 *     bought more and so keeps offering to sell after they already paid;
 *   - gallery size against slots left, which offers to sell a photo the guest
 *     has already downloaded once and can take again for nothing.
 *
 * Kept as a pure function so the rule is pinned without standing up a layout,
 * a router and a query client to read one boolean.
 */
import { describe, it, expect } from 'vitest';

import { shouldOfferFullPackage } from '../downloadQuotaOffer';

describe('shouldOfferFullPackage', () => {
  it('keeps the ordinary button when everything left fits in the allowance', () => {
    expect(shouldOfferFullPackage(10, 20)).toBe(false);
  });

  it('offers the package when more is left than the allowance covers', () => {
    expect(shouldOfferFullPackage(30, 20)).toBe(true);
  });

  it('keeps the ordinary button on an exact fit', () => {
    expect(shouldOfferFullPackage(20, 20)).toBe(false);
  });

  it('never offers anything on an unlimited gallery', () => {
    expect(shouldOfferFullPackage(30, null)).toBe(false);
    expect(shouldOfferFullPackage(0, null)).toBe(false);
  });

  it('offers the package once the allowance is spent', () => {
    expect(shouldOfferFullPackage(1, 0)).toBe(true);
  });

  it('leaves a client who bought more with an ordinary button', () => {
    // 100-photo gallery, 90 already delivered, 20 slots bought: comparing the
    // gallery against the free limit would sell them a second package here.
    expect(shouldOfferFullPackage(100 - 90, 20)).toBe(false);
  });
});
