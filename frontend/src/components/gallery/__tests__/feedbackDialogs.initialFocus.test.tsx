/**
 * The client gallery closes its viewer when one of these dialogs opens behind
 * it, and then focuses the element marked data-initial-focus: the dialog's own
 * autofocus ran while the viewer still held the page inert, so it was lost.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import { GuestNamePromptModal } from '../GuestNamePromptModal';
import { FeedbackIdentityModal } from '../FeedbackIdentityModal';
import { FeedbackLimitReachedModal } from '../FeedbackLimitReachedModal';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
      i18n: { language: 'en' },
    }),
  };
});

vi.mock('../../../contexts/GuestIdentityContext', () => ({
  useGuestIdentity: () => ({ promptOpen: true, closePrompt: vi.fn(), register: vi.fn(), openRecovery: vi.fn() }),
}));

const marked = () => document.querySelectorAll<HTMLElement>('[data-initial-focus]');

describe('the element each feedback dialog wants focused first', () => {
  it('is the name field of the guest name prompt', () => {
    render(<GuestNamePromptModal />);
    expect(marked()).toHaveLength(1);
    expect(marked()[0]).toBe(screen.getByPlaceholderText('Enter your name'));
  });

  it('is the first field of the name and email form', () => {
    render(<FeedbackIdentityModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} feedbackType="like" />);
    expect(marked()).toHaveLength(1);
    expect(marked()[0]).toBe(screen.getByPlaceholderText('Enter your name'));
  });

  it('is the OK button of the limit notice', () => {
    render(<FeedbackLimitReachedModal open feedbackType="favorite" limit={3} currentCount={3} onClose={vi.fn()} />);
    expect(marked()).toHaveLength(1);
    expect(marked()[0]).toBe(screen.getByRole('button', { name: 'Got it' }));
  });
});
