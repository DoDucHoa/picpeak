import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PasswordField } from '../PasswordField';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-toastify', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

describe('PasswordField (spec 3, 5.4)', () => {
  it('shows the password in clear under its label, with no confirm field', () => {
    render(<PasswordField label="Gallery password" value="Anna-2026-x7Kp2Q" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="Regenerate" />);
    const field = screen.getByLabelText('Gallery password');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('Anna-2026-x7Kp2Q');
    expect(screen.queryByText(/confirm/i)).toBeNull();
  });

  it('regenerates and reports typing', () => {
    const onChange = vi.fn();
    const onRegenerate = vi.fn();
    render(<PasswordField label="P" value="abcdef" onChange={onChange} onRegenerate={onRegenerate} regenerateLabel="Regenerate" />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('P'), { target: { value: 'mine-123' } });
    expect(onChange).toHaveBeenCalledWith('mine-123');
  });

  it('copies the value, and offers no copy while empty', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { rerender } = render(<PasswordField label="P" value="" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    rerender(<PasswordField label="P" value="abcdef" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('abcdef');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Copied'));
  });

  // Final review: over plain HTTP there is no navigator.clipboard, and a
  // denied clipboard rejects. "Copied" must not appear when nothing was copied.
  describe('when the clipboard is unavailable', () => {
    const exec = vi.fn();
    beforeEach(() => {
      toastSuccess.mockReset();
      toastError.mockReset();
      exec.mockReset();
      Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    });

    it('falls back to the old copy command when there is no clipboard API', async () => {
      Object.assign(navigator, { clipboard: undefined });
      exec.mockReturnValue(true);
      render(<PasswordField label="P" value="abcdef" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Copied'));
      expect(exec).toHaveBeenCalledWith('copy');
    });

    it('says the copy failed when the clipboard refuses and the fallback fails too', async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
      exec.mockReturnValue(false);
      render(<PasswordField label="P" value="abcdef" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not copy to clipboard'));
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });

  it('shows an error and marks the field invalid', () => {
    render(<PasswordField label="P" value="abc" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" error="Too short" />);
    expect(screen.getByLabelText('P')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Too short')).toBeInTheDocument();
  });
});
