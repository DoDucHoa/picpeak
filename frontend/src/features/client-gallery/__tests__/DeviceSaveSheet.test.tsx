import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeviceSaveSheet } from '../toolbar/DeviceSaveSheet';
import type { DeviceSave, DeviceSaveSheet as SheetState } from '../state/useDeviceSave';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(values?.[name] ?? '')),
  }),
}));

const base: SheetState = {
  mode: 'photos', phase: 'fetching', done: 0, total: 45, batchIndex: 0, batchCount: 3, from: 1, to: 20, dismissed: false,
};

function save(sheet: SheetState | null): DeviceSave {
  return { mode: 'photos', sheet, run: vi.fn(), confirm: vi.fn(), stop: vi.fn() };
}

it('renders nothing while no run is going', () => {
  render(<DeviceSaveSheet deviceSave={save(null)} />);
  expect(screen.queryByTestId('device-save-sheet')).toBeNull();
});

it('shows progress while fetching, with Stop', () => {
  const deviceSave = save({ ...base, done: 12 });
  render(<DeviceSaveSheet deviceSave={deviceSave} />);
  expect(screen.getByText('Preparing your photos')).toBeTruthy();
  expect(screen.getByText('12 of 45')).toBeTruthy();
  expect(screen.getByText('Batch 1 of 3')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('12');
  fireEvent.click(screen.getByText('Stop'));
  expect(deviceSave.stop).toHaveBeenCalled();
});

it('asks for the tap when a batch is ready, and says when the last one was not saved', () => {
  const deviceSave = save({ ...base, phase: 'ready', done: 40, batchIndex: 1, from: 21, to: 40, dismissed: true });
  render(<DeviceSaveSheet deviceSave={deviceSave} />);
  expect(screen.getByText('Photos 21 to 40 of 45')).toBeTruthy();
  expect(screen.getByText(/Nothing was saved yet\./)).toBeTruthy();
  fireEvent.click(screen.getByText('Save to Photos'));
  expect(deviceSave.confirm).toHaveBeenCalled();
});

it('titles an Android run as a download', () => {
  render(<DeviceSaveSheet deviceSave={save({ ...base, mode: 'files', batchCount: 1 })} />);
  expect(screen.getByText('Downloading your photos')).toBeTruthy();
  expect(screen.queryByText(/Batch/)).toBeNull();
});
