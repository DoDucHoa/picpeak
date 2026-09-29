import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (k: string, fb: string | { count?: number }, opts?: { count?: number; sections?: string }) => {
      if (k === 'events.saveBar.count') return `${(opts ?? (fb as { count: number })).count} unsaved`;
      if (k === 'events.saveBar.changedElsewhere') return `elsewhere: ${opts?.sections}`;
      return typeof fb === 'string' ? fb : k;
    },
  }),
}));

import { EventSaveBar } from '../EventSaveBar';

const props = { count: 2, isSaving: false, error: null, changedElsewhere: [], onSave: vi.fn(), onDiscard: vi.fn() };

it('is absent with nothing to save', () => {
  render(<EventSaveBar {...props} count={0} />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(document.body.dataset.saveBar).toBeUndefined();
});

it('is a labelled region with a polite count', () => {
  render(<EventSaveBar {...props} />);
  expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('2 unsaved');
  expect(document.body.dataset.saveBar).toBe('on');
});

it('saves and discards', async () => {
  render(<EventSaveBar {...props} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(props.onSave).toHaveBeenCalled();
  expect(props.onDiscard).toHaveBeenCalled();
});

it('moves focus to a failed save', () => {
  render(<EventSaveBar {...props} error="Feedback settings did not save." />);
  expect(screen.getByRole('alert')).toHaveFocus();
});

it('names the sections changed elsewhere', () => {
  render(<EventSaveBar {...props} changedElsewhere={['Details', 'Access']} />);
  expect(screen.getByText('elsewhere: Details, Access')).toBeInTheDocument();
});

it('disables both buttons while saving', () => {
  render(<EventSaveBar {...props} isSaving />);
  // The spinner adds its own "Loading" name in front of the label.
  expect(screen.getByRole('button', { name: /Save$/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
});
