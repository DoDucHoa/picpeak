import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
}));

import { BannerOverride } from '../BannerOverride';

const props = { title: 'Info Banner', help: 'help', placeholder: 'p', globalMarkdown: 'Global **note**' };

it('shows the global text read-only while inheriting', () => {
  render(<BannerOverride {...props} mode="inherit" markdown="" onModeChange={vi.fn()} onMarkdownChange={vi.fn()} />);
  expect(screen.getByText('Uses the banner from Branding.')).toBeInTheDocument();
  expect(screen.getByText('note')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('opening switches to a custom banner, and going back returns to inherit', async () => {
  const onModeChange = vi.fn();
  const { rerender } = render(<BannerOverride {...props} mode="inherit" markdown="" onModeChange={onModeChange} onMarkdownChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Override for this event' }));
  expect(onModeChange).toHaveBeenLastCalledWith('custom');
  rerender(<BannerOverride {...props} mode="custom" markdown="" onModeChange={onModeChange} onMarkdownChange={vi.fn()} />);
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Use the Branding banner again' }));
  expect(onModeChange).toHaveBeenLastCalledWith('inherit');
});

it('opens expanded when the event already overrides', () => {
  render(<BannerOverride {...props} globalMarkdown="" mode="off" markdown="" onModeChange={vi.fn()} onMarkdownChange={vi.fn()} />);
  expect(screen.getByRole('radio', { name: /Off/ })).toBeChecked();
});

it('says when Branding has no banner', () => {
  render(<BannerOverride {...props} globalMarkdown="  " mode="inherit" markdown="" onModeChange={vi.fn()} onMarkdownChange={vi.fn()} />);
  expect(screen.getByText('No banner is set in Branding, so none shows.')).toBeInTheDocument();
});
