import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportContact } from '../SupportContact';

describe('SupportContact', () => {
  it('renders nothing without a support address', () => {
    const { container } = render(<SupportContact email={undefined} label="Need help?" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a blank address', () => {
    const { container } = render(<SupportContact email="   " label="Need help?" />);
    expect(container.firstChild).toBeNull();
  });

  it('links the configured address', () => {
    render(<SupportContact email=" help@phoever.de " label="Need help?" />);
    const link = screen.getByRole('link', { name: 'help@phoever.de' });
    expect(link.getAttribute('href')).toBe('mailto:help@phoever.de');
    expect(screen.getByText(/Need help\?/)).toBeTruthy();
  });
});
