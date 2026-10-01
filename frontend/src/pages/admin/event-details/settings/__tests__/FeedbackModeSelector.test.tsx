import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedbackModeSelector } from '../FeedbackModeSelector';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));

describe('FeedbackModeSelector', () => {
  it('names Custom after Settings when the defaults came from there (spec 5.7)', () => {
    render(<FeedbackModeSelector mode="custom" offered={['off', 'picks', 'full', 'custom']} onSelect={vi.fn()} fromSettings />);
    expect(screen.getByRole('radio', { name: /^Custom \(from Settings\)/ })).toBeChecked();
  });

  it('keeps the plain Custom label otherwise', () => {
    render(<FeedbackModeSelector mode="custom" offered={['off', 'picks', 'full', 'custom']} onSelect={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /^Custom/ })).toBeChecked();
    expect(screen.queryByText('Custom (from Settings)')).toBeNull();
  });
});
