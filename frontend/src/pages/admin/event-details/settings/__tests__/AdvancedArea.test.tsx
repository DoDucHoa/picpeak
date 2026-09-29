import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
import { AdvancedArea, useExpertMode } from '../AdvancedArea';

beforeEach(() => localStorage.clear());

it('is collapsed until opened', async () => {
  render(<AdvancedArea expert={false}><p>hidden stuff</p></AdvancedArea>);
  expect(screen.queryByText('hidden stuff')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('hidden stuff')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide advanced options' })).toHaveAttribute('aria-expanded', 'true');
});

it('is open in expert mode', () => {
  render(<AdvancedArea expert><p>shown</p></AdvancedArea>);
  expect(screen.getByText('shown')).toBeInTheDocument();
});

it('remembers expert mode per browser', () => {
  const { result } = renderHook(() => useExpertMode());
  act(() => result.current[1](true));
  expect(renderHook(() => useExpertMode()).result.current[0]).toBe(true);
});

it('survives a browser that refuses storage', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  const { result } = renderHook(() => useExpertMode());
  expect(result.current[0]).toBe(false);
  act(() => result.current[1](true));
  expect(result.current[0]).toBe(true);
  get.mockRestore(); set.mockRestore();
});
