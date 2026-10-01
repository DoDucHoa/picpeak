import { describe, expect, it } from 'vitest';
import { applyFeedbackMode, feedbackMode, offeredModes } from '../feedbackMode';
import type { FeedbackSettings } from '../../../../../services/feedback.service';

const base: FeedbackSettings = {
  feedback_enabled: true, allow_ratings: true, allow_likes: true, allow_comments: true, allow_favorites: true,
  allow_reactions: true, allow_color_labels: true, require_name_email: true, moderate_comments: false,
  show_feedback_to_guests: false, identity_mode: 'guest', max_favorites_per_guest: 5, max_likes_per_guest: null,
};
const picks = { ...base, allow_ratings: false, allow_likes: false, allow_comments: false, allow_reactions: false };
const custom = { ...base, allow_likes: false };

describe('feedback mode (spec 5.7)', () => {
  it('reads the mode from the enable switch and the five type toggles', () => {
    expect(feedbackMode(base)).toBe('full');
    expect(feedbackMode(picks)).toBe('picks');
    expect(feedbackMode(custom)).toBe('custom');
    expect(feedbackMode({ ...custom, feedback_enabled: false })).toBe('off');
  });

  it('treats SQLite 0/1 like booleans', () => {
    expect(feedbackMode({ ...base, allow_likes: 0 as never, feedback_enabled: 1 as never })).toBe('custom');
  });

  it('writes each on-mode and never touches the other settings', () => {
    const toPicks = applyFeedbackMode(base, base, 'picks');
    expect(toPicks).toEqual({ ...picks });
    const toFull = applyFeedbackMode(picks, picks, 'full');
    expect(toFull).toEqual(base);
    expect(toFull.allow_color_labels).toBe(true);
    expect(toFull.identity_mode).toBe('guest');
  });

  it('Off keeps the toggles underneath, and on again offers Custom when they match neither mode', () => {
    const off = applyFeedbackMode(custom, custom, 'off');
    expect(off).toEqual({ ...custom, feedback_enabled: false });
    expect(offeredModes(off, custom)).toEqual(['off', 'picks', 'full', 'custom']);
    expect(feedbackMode(applyFeedbackMode(off, custom, 'custom'))).toBe('custom');
  });

  it('Custom stays offered after trying another mode and brings the saved toggles back', () => {
    const tried = applyFeedbackMode(custom, custom, 'full');
    expect(offeredModes(tried, custom)).toContain('custom');
    expect(applyFeedbackMode(tried, custom, 'custom')).toEqual(custom);
  });

  it('offers no Custom when neither the saved nor the current toggles need it', () => {
    expect(offeredModes(base, picks)).toEqual(['off', 'picks', 'full']);
  });

  it('keeps every other field of the object it is given (the create screen passes a subset)', () => {
    const subset = { feedback_enabled: false, allow_favorites: true, allow_likes: true, allow_ratings: true, allow_comments: true, allow_reactions: true, identity_mode: 'guest' as const };
    const next = applyFeedbackMode(subset, subset, 'picks');
    expect(next).toEqual({ ...subset, feedback_enabled: true, allow_likes: false, allow_ratings: false, allow_comments: false, allow_reactions: false });
  });
});
