/**
 * Under createBrowserRouter a render error inside a route (a failed lazy
 * chunk after a deploy, most likely) is caught by the router's own boundary,
 * which shows a developer screen. The root layout keeps the app's localized
 * error page in front of it.
 */
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

vi.mock('../../services/analytics.service', () => ({ AnalyticsRouteTracker: () => null }));
vi.mock('../MaintenanceWrapper', () => ({
  MaintenanceWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { RootLayout } from '../RootLayout';

function Broken(): JSX.Element {
  throw new Error('chunk failed');
}

it('shows the app error page, not the router default, when a route fails to render', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const router = createMemoryRouter(
    [{ element: <RootLayout />, children: [{ path: '/', element: <Broken /> }] }],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole('heading', { name: /oopsSomethingWentWrong|Oops/i })).toBeInTheDocument();
  expect(screen.queryByText(/Unexpected Application Error/)).toBeNull();
});
