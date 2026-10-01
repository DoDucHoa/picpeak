import { it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../i18n/locales/en.json';
import { ExpiryToast } from '../cover/ExpiryToast';

// Trans renders nothing without an i18next instance, and the suite has no global one.
i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } } });

beforeEach(() => sessionStorage.clear());

it('shows the expiry date and remembers a dismissal for the session', () => {
  const { unmount } = render(<ExpiryToast slug="s" expiresAt="2026-10-07T00:00:00Z" />);
  expect(screen.getByText(/07 Oct 2026/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /close/i }));
  unmount();
  render(<ExpiryToast slug="s" expiresAt="2026-10-07T00:00:00Z" />);
  expect(screen.queryByText(/07 Oct 2026/)).toBeNull();
});

it('renders nothing for a gallery that never expires', () => {
  const { container } = render(<ExpiryToast slug="s" expiresAt={null} />);
  expect(container.firstChild).toBeNull();
});
