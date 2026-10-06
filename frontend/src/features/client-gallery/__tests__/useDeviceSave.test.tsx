import { it, expect, vi, beforeEach, describe } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ShareOutcome } from '../../../utils/deviceSave';

const fetchPhotoBlob = vi.fn();
const triggerBrowserDownload = vi.fn();
vi.mock('../../../services/gallery.service', () => ({
  galleryService: {
    fetchPhotoBlob: (...a: unknown[]) => fetchPhotoBlob(...a),
    triggerBrowserDownload: (...a: unknown[]) => triggerBrowserDownload(...a),
  },
}));

let mode: 'photos' | 'files' | 'archive' = 'photos';
const shareFiles = vi.fn<(files: File[]) => Promise<ShareOutcome>>();
vi.mock('../../../utils/deviceSave', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/deviceSave')>();
  return {
    ...actual,
    getDeviceSaveMode: () => mode,
    shareFiles: (files: File[]) => shareFiles(files),
  };
});

import { useDeviceSave } from '../state/useDeviceSave';

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, filename: `p${i + 1}.jpg`, size: 1 }));

beforeEach(() => {
  mode = 'photos';
  [fetchPhotoBlob, triggerBrowserDownload, shareFiles].forEach((fn) => fn.mockReset());
  fetchPhotoBlob.mockImplementation(async (_slug: string, id: number) => ({
    blob: new Blob(['x'], { type: 'image/jpeg' }), serverFilename: `server-${id}.jpg`,
  }));
});

describe('on iOS', () => {
  it('shares one photo straight into the share sheet, under the server filename', async () => {
    shareFiles.mockResolvedValue('shared');
    const { result } = renderHook(() => useDeviceSave('s'));
    let outcome: string | undefined;
    await act(async () => { outcome = await result.current.run(photos(1), { quiet: true }); });
    expect(outcome).toBe('done');
    expect(shareFiles).toHaveBeenCalledTimes(1);
    expect(shareFiles.mock.calls[0][0].map((f) => f.name)).toEqual(['server-1.jpg']);
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect(result.current.sheet).toBeNull();
  });

  it('passes the chosen size to every request', async () => {
    shareFiles.mockResolvedValue('shared');
    const { result } = renderHook(() => useDeviceSave('s'));
    await act(async () => { await result.current.run(photos(2), { resolution: '2048' }); });
    expect(fetchPhotoBlob.mock.calls.map((call) => call[3].resolution)).toEqual(['2048', '2048']);
  });

  it('asks for a tap when iOS refuses the share, then shares on that tap', async () => {
    shareFiles.mockResolvedValueOnce('needs-tap').mockResolvedValueOnce('shared');
    const { result } = renderHook(() => useDeviceSave('s'));
    let running!: Promise<string>;
    act(() => { running = result.current.run(photos(1), { quiet: true }); });
    await waitFor(() => expect(result.current.sheet?.phase).toBe('ready'));
    act(() => result.current.confirm());
    await act(async () => { await running; });
    expect(await running).toBe('done');
    expect(shareFiles).toHaveBeenCalledTimes(2);
    expect(result.current.sheet).toBeNull();
  });

  it('saves a large selection in batches of 20, each after its own tap', async () => {
    shareFiles.mockResolvedValue('shared');
    const { result } = renderHook(() => useDeviceSave('s'));
    let running!: Promise<string>;
    act(() => { running = result.current.run(photos(45)); });

    // Batch one goes straight to the share sheet.
    await waitFor(() => expect(result.current.sheet).toMatchObject({ phase: 'ready', batchIndex: 1, from: 21, to: 40 }));
    expect(shareFiles.mock.calls[0][0]).toHaveLength(20);
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.sheet).toMatchObject({ phase: 'ready', batchIndex: 2, from: 41, to: 45, batchCount: 3 }));
    act(() => result.current.confirm());
    await act(async () => { await running; });

    expect(shareFiles.mock.calls.map((call) => call[0].length)).toEqual([20, 20, 5]);
    expect(fetchPhotoBlob).toHaveBeenCalledTimes(45);
  });

  it('keeps a dismissed batch waiting for another tap, and Stop ends the run', async () => {
    shareFiles.mockResolvedValue('dismissed');
    const { result } = renderHook(() => useDeviceSave('s'));
    let running!: Promise<string>;
    act(() => { running = result.current.run(photos(3)); });
    await waitFor(() => expect(result.current.sheet).toMatchObject({ phase: 'ready', dismissed: true }));
    act(() => result.current.stop());
    await act(async () => { await running; });
    expect(await running).toBe('stopped');
    expect(result.current.sheet).toBeNull();
  });

  it('ends quietly when the guest closes the share sheet from the viewer', async () => {
    shareFiles.mockResolvedValue('dismissed');
    const { result } = renderHook(() => useDeviceSave('s'));
    let outcome: string | undefined;
    await act(async () => { outcome = await result.current.run(photos(1), { quiet: true }); });
    expect(outcome).toBe('stopped');
    expect(result.current.sheet).toBeNull();
  });

  it('falls back to plain downloads where files cannot be shared', async () => {
    shareFiles.mockResolvedValue('unsupported');
    const { result } = renderHook(() => useDeviceSave('s'));
    await act(async () => { await result.current.run(photos(2)); });
    expect(triggerBrowserDownload).toHaveBeenCalledTimes(2);
  });

  it('rejects with the server refusal and cancels the rest', async () => {
    const refusal = Object.assign(new Error('quota'), { response: { status: 402 } });
    fetchPhotoBlob.mockImplementation(async (_slug: string, id: number, _p: unknown, opts: { signal: AbortSignal }) => {
      if (id === 2) throw refusal;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (opts.signal.aborted) throw Object.assign(new Error('canceled'), { name: 'CanceledError' });
      return { blob: new Blob(['x']), serverFilename: null };
    });
    const { result } = renderHook(() => useDeviceSave('s'));
    let caught: unknown;
    await act(async () => { await result.current.run(photos(5)).catch((e) => { caught = e; }); });
    expect(caught).toBe(refusal);
    expect(shareFiles).not.toHaveBeenCalled();
    expect(result.current.sheet).toBeNull();
  });
});

describe('on Android', () => {
  it('downloads every photo as its own file, with no share sheet', async () => {
    mode = 'files';
    const { result } = renderHook(() => useDeviceSave('s'));
    let outcome: string | undefined;
    await act(async () => { outcome = await result.current.run(photos(4)); });
    expect(outcome).toBe('done');
    expect(shareFiles).not.toHaveBeenCalled();
    expect(triggerBrowserDownload.mock.calls.map((call) => call[1]).sort()).toEqual(
      ['server-1.jpg', 'server-2.jpg', 'server-3.jpg', 'server-4.jpg'],
    );
  });

  it('stops mid run and cancels the requests still in flight', async () => {
    mode = 'files';
    const signals: AbortSignal[] = [];
    fetchPhotoBlob.mockImplementation((_slug: string, _id: number, _p: unknown, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { name: 'CanceledError' })));
      });
    });
    const { result } = renderHook(() => useDeviceSave('s'));
    let running!: Promise<string>;
    act(() => { running = result.current.run(photos(10)); });
    await waitFor(() => expect(result.current.sheet).toMatchObject({ mode: 'files', phase: 'fetching', total: 10 }));
    act(() => result.current.stop());
    await act(async () => { await running; });
    expect(await running).toBe('stopped');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });
});

it('does nothing on a desktop, which keeps the archive', async () => {
  mode = 'archive';
  const { result } = renderHook(() => useDeviceSave('s'));
  let outcome: string | undefined;
  await act(async () => { outcome = await result.current.run(photos(3)); });
  expect(outcome).toBe('stopped');
  expect(fetchPhotoBlob).not.toHaveBeenCalled();
});
