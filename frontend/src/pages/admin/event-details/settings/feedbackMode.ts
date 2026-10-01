import type { FeedbackSettings } from '../../../../services/feedback.service';

/** The guest feedback mode (spec 5.7), derived from the enable switch and five type toggles. */
export type FeedbackMode = 'off' | 'picks' | 'full' | 'custom';

export const MODE_TYPES = ['allow_favorites', 'allow_likes', 'allow_ratings', 'allow_comments', 'allow_reactions'] as const;
type ModeType = typeof MODE_TYPES[number];
type Types = Record<ModeType, boolean>;

const PICKS: Types = { allow_favorites: true, allow_likes: false, allow_ratings: false, allow_comments: false, allow_reactions: false };
const FULL: Types = { allow_favorites: true, allow_likes: true, allow_ratings: true, allow_comments: true, allow_reactions: true };

const typesOf = (s: Partial<FeedbackSettings>): Types =>
  Object.fromEntries(MODE_TYPES.map((k) => [k, Boolean(s[k])])) as Types;
const same = (a: Types, b: Types) => MODE_TYPES.every((k) => a[k] === b[k]);
const typesMode = (s: Partial<FeedbackSettings>): Exclude<FeedbackMode, 'off'> => {
  const t = typesOf(s);
  if (same(t, PICKS)) return 'picks';
  if (same(t, FULL)) return 'full';
  return 'custom';
};

export function feedbackMode(s: Partial<FeedbackSettings>): FeedbackMode {
  return s.feedback_enabled ? typesMode(s) : 'off';
}

/** Custom is offered while the saved or the current toggles match neither on-mode. */
export function offeredModes(current: Partial<FeedbackSettings>, saved: Partial<FeedbackSettings>): FeedbackMode[] {
  const modes: FeedbackMode[] = ['off', 'picks', 'full'];
  if (typesMode(current) === 'custom' || typesMode(saved) === 'custom') modes.push('custom');
  return modes;
}

/**
 * The settings after picking a mode. Off keeps the toggles underneath; Custom
 * brings back the saved toggles. Color labels, identity, caps and the privacy
 * switches are never changed by a mode.
 */
export function applyFeedbackMode<T extends Partial<FeedbackSettings>>(current: T, saved: Partial<FeedbackSettings>, mode: FeedbackMode): T {
  if (mode === 'off') return { ...current, feedback_enabled: false };
  const types = mode === 'picks' ? PICKS : mode === 'full' ? FULL : typesOf(saved);
  return { ...current, feedback_enabled: true, ...types };
}
