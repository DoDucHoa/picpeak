/**
 * The lightbox keyboard shortcut scheme is one global setting for every
 * gallery since P3 (spec 5.10): the card offers no per-event choice.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FeedbackSettings } from '../FeedbackSettings';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : _key),
      i18n: { language: 'en' },
    }),
  };
});

const settings = {
  feedback_enabled: true,
  allow_ratings: true,
  allow_likes: true,
  allow_comments: true,
  allow_favorites: true,
  allow_reactions: false,
  // The old choice only appeared with color labels on.
  allow_color_labels: true,
  require_name_email: false,
  moderate_comments: true,
  show_feedback_to_guests: false,
};

describe('FeedbackSettings keyboard shortcuts', () => {
  it('offers no per-event keyboard shortcut choice, even with color labels on', () => {
    render(<FeedbackSettings settings={settings} onChange={vi.fn()} />);

    expect(document.querySelector('input[name="keybind_mode"]')).toBeNull();
    // The rest of the card still renders.
    expect(screen.getByText('Show Feedback to Guests')).toBeInTheDocument();
  });
});
