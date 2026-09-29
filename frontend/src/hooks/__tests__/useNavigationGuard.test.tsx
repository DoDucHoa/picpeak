import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router-dom';

const confirmMock = vi.fn();
vi.mock('../../components/common', () => ({ useConfirm: () => confirmMock }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));

import { useNavigationGuard } from '../useNavigationGuard';

let allowNext: () => void = () => {};
function Page({ dirty }: { dirty: boolean }) {
  const { allowNextNavigation } = useNavigationGuard(dirty);
  allowNext = allowNextNavigation;
  const navigate = useNavigate();
  return (
    <>
      <Link to="/events/1?tab=settings">tab</Link>
      <Link to="/events">leave</Link>
      <button onClick={() => { allowNextNavigation(); navigate('/events/2'); }}>redirect</button>
    </>
  );
}

const mount = (dirty: boolean) => {
  const router = createMemoryRouter(
    [{ path: '/events/:id', element: <Page dirty={dirty} /> }, { path: '/events', element: <p>list</p> }],
    { initialEntries: ['/events/1'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => confirmMock.mockReset());

it('never asks for a tab or section change', async () => {
  const router = mount(true);
  await userEvent.click(screen.getByText('tab'));
  expect(confirmMock).not.toHaveBeenCalled();
  expect(router.state.location.search).toBe('?tab=settings');
});

it('asks once before leaving and stays when the user cancels', async () => {
  confirmMock.mockResolvedValue(false);
  const router = mount(true);
  await userEvent.click(screen.getByText('leave'));
  expect(confirmMock).toHaveBeenCalledTimes(1);
  expect(router.state.location.pathname).toBe('/events/1');
});

it('leaves when the user confirms', async () => {
  confirmMock.mockResolvedValue(true);
  mount(true);
  await userEvent.click(screen.getByText('leave'));
  expect(await screen.findByText('list')).toBeInTheDocument();
});

it('lets the page\'s own redirect through', async () => {
  const router = mount(true);
  await userEvent.click(screen.getByText('redirect'));
  expect(confirmMock).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe('/events/2');
});

it('does not ask when nothing is unsaved', async () => {
  mount(false);
  await userEvent.click(screen.getByText('leave'));
  expect(confirmMock).not.toHaveBeenCalled();
});

it('guards closing the tab only while dirty', () => {
  const add = vi.spyOn(window, 'addEventListener');
  mount(false);
  expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false);
  act(() => { mount(true); });
  expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true);
  add.mockRestore();
  void allowNext;
});
