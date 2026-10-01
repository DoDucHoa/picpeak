import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button';

// CustomerGroupsPanel confirms a group deletion with variant="danger", which
// the Button type did not offer, so the build failed and the button rendered
// with no variant styling at all.
describe('Button danger variant', () => {
  it('renders a destructive action in red', () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toMatch(/\bbg-red-600\b/);
    expect(button.className).toMatch(/\btext-white\b/);
  });
});
