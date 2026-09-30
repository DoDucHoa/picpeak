import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (k: string, o?: unknown) => {
      const opts = (typeof o === 'object' && o) ? o as Record<string, unknown> : {};
      if (k === 'events.expiry.days') return `${opts.count} days`;
      if (k === 'events.expiry.expiresOn') return `Expires on ${opts.date}`;
      return typeof o === 'string' ? o : (opts.defaultValue as string) ?? k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('../../../../../hooks/useLocalizedDate', () => ({
  useLocalizedDate: () => ({ format: (d: string | Date) => String(d).slice(0, 10) }),
}));
vi.mock('../../../../../components/common', async () => ({
  ...(await vi.importActual<object>('../../../../../components/common')),
  LocalizedDateInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="expiry date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ExpiryField, expiryFromToday } from '../ExpiryField';

describe('ExpiryField (spec 5.8)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T10:00:00')); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts the quick buttons from today', () => {
    expect(expiryFromToday(30)).toBe('2026-10-31');
    expect(expiryFromToday(90)).toBe('2026-12-30');
  });

  it('sets the date from a quick button and shows the resulting date', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ExpiryField value="" onChange={onChange} allowNever />);
    expect(screen.getByText('Never expires')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '60 days' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-30');
    rerender(<ExpiryField value="2026-11-30" onChange={onChange} allowNever />);
    expect(screen.getByRole('button', { name: '60 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Expires on 2026-11-30')).toBeInTheDocument();
  });

  it('offers Never on edit and clears the date with it', async () => {
    const onChange = vi.fn();
    render(<ExpiryField value="2026-11-30" onChange={onChange} allowNever />);
    await userEvent.click(screen.getByRole('button', { name: 'Never' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('hides Never when it is not allowed', () => {
    render(<ExpiryField value="2026-11-30" onChange={vi.fn()} allowNever={false} />);
    expect(screen.queryByRole('button', { name: 'Never' })).toBeNull();
  });
});
