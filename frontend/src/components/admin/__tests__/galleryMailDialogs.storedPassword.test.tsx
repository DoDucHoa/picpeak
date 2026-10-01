/**
 * Event form redesign P4 (operator decision 2026-09-30): with a stored copy
 * the server fills the password into the gallery mail, so the publish and
 * send dialogs stop asking for it and offer "Use a different password".
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : (fb as { defaultValue?: string })?.defaultValue ?? k), i18n: { language: 'en' } }),
}));

import { PublishGalleryDialog } from '../PublishGalleryDialog';
import { SendGalleryEmailDialog } from '../SendGalleryEmailDialog';

const publishButton = () => screen.getByRole('button', { name: /publishAndNotify|^Publish$/ });

describe('gallery mail dialogs with a stored password', () => {
  it('publish asks for nothing when a copy is stored, and sends no password', async () => {
    const onConfirm = vi.fn();
    render(<PublishGalleryDialog eventName="E" requirePassword customerEmail="c@example.com" storedPassword isPublishing={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    expect(screen.getByText('The email includes the stored gallery password.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter the gallery password')).toBeNull();
    await userEvent.click(publishButton());
    expect(onConfirm).toHaveBeenCalledWith(undefined, true);
  });

  it('publish still asks when no copy is stored', async () => {
    const onConfirm = vi.fn();
    render(<PublishGalleryDialog eventName="E" requirePassword customerEmail="c@example.com" storedPassword={false} isPublishing={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Enter the gallery password')).toBeInTheDocument();
    await userEvent.click(publishButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('"Use a different password" brings the field back and sends what is typed', async () => {
    const onConfirm = vi.fn();
    render(<SendGalleryEmailDialog eventName="E" recipient="c@example.com" requirePassword storedPassword isSending={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use a different password' }));
    await userEvent.type(screen.getByPlaceholderText('Enter the gallery password'), 'Harbour-Light-91!');
    await userEvent.click(screen.getByRole('button', { name: 'Send gallery email' }));
    expect(onConfirm).toHaveBeenCalledWith('Harbour-Light-91!');
  });

  it('send without a stored copy still requires the password', async () => {
    const onConfirm = vi.fn();
    render(<SendGalleryEmailDialog eventName="E" recipient="c@example.com" requirePassword isSending={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send gallery email' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
