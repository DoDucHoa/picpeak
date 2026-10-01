import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IdentityModeField } from '../IdentityModeField';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));

describe('IdentityModeField', () => {
  it('treats no value as simple and reports a pick', () => {
    const onChange = vi.fn();
    render(<IdentityModeField value={undefined} onChange={onChange} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.find((r) => r.value === 'simple')!.checked).toBe(true);
    fireEvent.click(radios.find((r) => r.value === 'guest')!);
    expect(onChange).toHaveBeenCalledWith('guest');
  });

  it('warns about the shared tag only when it is picked', () => {
    const { rerender } = render(<IdentityModeField value="simple" onChange={vi.fn()} />);
    expect(screen.queryByText(/Colour tags in this mode have no author/)).toBeNull();
    rerender(<IdentityModeField value="shared" onChange={vi.fn()} />);
    expect(screen.getByText(/Colour tags in this mode have no author/)).toBeInTheDocument();
  });
});
