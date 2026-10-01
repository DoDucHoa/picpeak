import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
import { SectionRailLayout } from '../SectionRailLayout';

const sections = [{ id: 'details', label: 'Details' }, { id: 'access', label: 'Access', dirty: true }];

it('marks the active section and a section with unsaved changes', () => {
  render(<SectionRailLayout label="Event settings" sections={sections} active="details" onSelect={vi.fn()}><p>body</p></SectionRailLayout>);
  const nav = screen.getByRole('navigation', { name: 'Event settings' });
  expect(nav.querySelector('[aria-current="true"]')).toHaveTextContent('Details');
  expect(screen.getAllByLabelText('unsaved changes').length).toBeGreaterThan(0);
  expect(screen.getByText('body')).toBeInTheDocument();
});

it('selects from the rail and from the mobile select', async () => {
  const onSelect = vi.fn();
  render(<SectionRailLayout label="Event settings" sections={sections} active="details" onSelect={onSelect}><p /></SectionRailLayout>);
  await userEvent.click(screen.getByRole('button', { name: /Access/ }));
  await userEvent.selectOptions(screen.getByRole('combobox'), 'access');
  expect(onSelect).toHaveBeenNthCalledWith(1, 'access');
  expect(onSelect).toHaveBeenNthCalledWith(2, 'access');
});
