/**
 * The statistics card on an event's overview (issue 1430).
 *
 * An event that holds videos reported them as photos: "Total Photos: 40" for
 * forty clips. It now says "media" once there are videos. The photo and video
 * counts themselves moved to the summary strip above the cards
 * (EventSummaryStrip.test.tsx pins them), so the card no longer repeats them.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k),
      i18n: { language: 'en' },
    }),
  };
});

import { PhotoStatisticsCard } from '../PhotoStatisticsCard';
import type { Event } from '../../../../types';

const renderCard = (over: Partial<Event>) => render(
  <PhotoStatisticsCard
    event={{ id: 1, event_name: 'E', photo_count: 0, ...over } as Event}
    categories={[]}
    setActiveTab={vi.fn()}
  />
);

/** The value shown on the row carrying this label. */
const valueOf = (label: string) => screen.getByText(label).parentElement!.lastElementChild!.textContent;

describe('PhotoStatisticsCard', () => {
  it('keeps the photo wording for an event without videos', () => {
    renderCard({ photo_count: 12, video_count: 0, video_duration: 0 });

    expect(screen.getByText('events.photoStatistics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'events.managePhotos' })).toBeInTheDocument();
    expect(screen.queryByText('Video runtime')).not.toBeInTheDocument();
  });

  it('says media and gives the total runtime once there are videos', () => {
    renderCard({ photo_count: 143, video_count: 6, video_duration: 754 });

    expect(screen.getByText('Media Statistics')).toBeInTheDocument();
    expect(valueOf('Video runtime')).toBe('12:34');
    expect(screen.getByRole('button', { name: 'Manage Media' })).toBeInTheDocument();
  });

  it('leaves the photo and video counts to the summary strip', () => {
    renderCard({ photo_count: 40, video_count: 40, video_duration: 3723 });

    expect(screen.queryByText('events.totalPhotos')).not.toBeInTheDocument();
    expect(screen.queryByText('events.photos')).not.toBeInTheDocument();
    expect(screen.queryByText('Videos')).not.toBeInTheDocument();
    expect(valueOf('Video runtime')).toBe('1:02:03');
  });
});
