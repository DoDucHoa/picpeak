import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

vi.mock('../../services/analytics.service', () => ({ AnalyticsRouteTracker: () => <span>tracker</span> }));
vi.mock('../MaintenanceWrapper', () => ({
  MaintenanceWrapper: ({ children }: { children: React.ReactNode }) => <div data-testid="maintenance">{children}</div>,
}));
vi.mock('../common', () => ({ SkipLink: () => <a href="#main-content">skip</a> }));

import { RootLayout } from '../RootLayout';

it('renders the tracker, then the child route inside the maintenance wrapper with the skip link', async () => {
  const router = createMemoryRouter(
    [{ element: <RootLayout />, children: [{ path: '/', element: <p>child</p> }] }],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  expect(screen.getByText('tracker')).toBeInTheDocument();
  const wrapper = screen.getByTestId('maintenance');
  expect(wrapper).toContainElement(screen.getByText('skip'));
  expect(wrapper).toContainElement(await screen.findByText('child'));
});
