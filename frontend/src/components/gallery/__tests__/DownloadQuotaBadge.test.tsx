/**
 * The client-facing readout of the download allowance.
 *
 * The badge states what is left, as a number the backend computed. Nothing
 * here recomputes a remaining count from a total minus a used count: a second
 * arithmetic path is a second answer, and the guest is being told what their
 * next download costs.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  // Renders the real default string with its interpolations, so an assertion
  // reads the sentence a guest sees rather than a key.
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      const fallback = typeof second === 'string' ? second : key;
      const vars = (typeof second === 'object' && second !== null ? second : third) as
        | Record<string, unknown>
        | undefined;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(vars?.[name] ?? ''),
      );
    },
    i18n: { language: 'en' },
  }),
}));

import { DownloadQuotaBadge } from '../DownloadQuotaBadge';
import type { DownloadQuotaState } from '../../../services/downloadQuota.service';

const quota = (over: Partial<DownloadQuotaState> = {}): DownloadQuotaState => ({
  enabled: true,
  unlimited: false,
  freeLimit: 20,
  pricePerPhoto: 1,
  total: 20,
  used: 15,
  remaining: 5,
  enabledAt: '2026-09-15T00:00:00Z',
  ...over,
});

describe('DownloadQuotaBadge', () => {
  it('states the remaining allowance exactly as the backend reported it', () => {
    render(<DownloadQuotaBadge quota={quota()} />);

    expect(screen.getByText('5 of 20 downloads left')).toBeInTheDocument();
  });

  it('renders nothing for a gallery with the feature switched off', () => {
    const { container } = render(<DownloadQuotaBadge quota={quota({ enabled: false })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the quota has loaded', () => {
    const { container } = render(<DownloadQuotaBadge quota={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the unlimited label with no number at all', () => {
    render(
      <DownloadQuotaBadge quota={quota({ unlimited: true, total: null, remaining: null })} />,
    );

    const badge = screen.getByTestId('download-quota-badge');
    expect(badge).toHaveTextContent('Unlimited downloads');
    // A count next to "unlimited" is a contradiction, and `remaining` is null
    // here, so any digit on screen could only have been invented locally.
    expect(badge.textContent).not.toMatch(/\d/);
  });
});
