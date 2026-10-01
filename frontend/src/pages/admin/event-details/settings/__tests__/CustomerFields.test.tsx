import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CustomerFields } from '../CustomerFields';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));

const values = { customer_name: 'Anna', customer_email: 'anna@example.com', customer_phone: '' };

describe('CustomerFields', () => {
  it('labels the fields Settings make optional, on create', () => {
    render(<CustomerFields values={values} onChange={vi.fn()} phoneFieldEnabled={false} required={{ name: true, email: false }} />);
    expect(screen.getByLabelText('events.hostName')).toHaveValue('Anna');
    expect(screen.getByLabelText('events.hostEmail (common.optional)')).toHaveValue('anna@example.com');
  });

  it('adds no suffix when no requirements are passed (the event page)', () => {
    render(<CustomerFields values={values} onChange={vi.fn()} phoneFieldEnabled={false} />);
    expect(screen.getByLabelText('events.hostEmail')).toBeInTheDocument();
  });

  it('reports each change by field name, and shows the phone only when enabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CustomerFields values={values} onChange={onChange} phoneFieldEnabled={false} />);
    expect(screen.queryByRole('textbox', { name: /Customer Phone/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('events.hostName'), { target: { value: 'Bea' } });
    expect(onChange).toHaveBeenCalledWith('customer_name', 'Bea');
    rerender(<CustomerFields values={values} onChange={onChange} phoneFieldEnabled />);
    fireEvent.change(screen.getByLabelText(/Customer Phone/), { target: { value: '+49 1' } });
    expect(onChange).toHaveBeenCalledWith('customer_phone', '+49 1');
  });

  it('shows a field error under its field', () => {
    render(<CustomerFields values={values} onChange={vi.fn()} phoneFieldEnabled={false} errors={{ customer_email: 'bad email' }} />);
    expect(screen.getByText('bad email')).toBeInTheDocument();
  });
});
