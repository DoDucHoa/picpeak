/**
 * Spec 5.9: type and date edits never move the slug, so the rename dialog is
 * where the admin learns that a rename rebuilds it from type, name and date.
 */
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
}));

import { EventRenameDialog } from '../EventRenameDialog';

it('says the new address comes from the current type, name and date', () => {
  render(
    <EventRenameDialog isOpen eventName="Lakeside" eventId={1} onClose={vi.fn()} onRename={vi.fn()} onValidate={vi.fn().mockResolvedValue({ valid: true })} />,
  );
  expect(screen.getByText("The new address is built from the event's current type, name and date.")).toBeInTheDocument();
});
