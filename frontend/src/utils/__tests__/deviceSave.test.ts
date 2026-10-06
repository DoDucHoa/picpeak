import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDeviceSaveMode, isIOSDevice, shareFiles, splitIntoBatches } from '../deviceSave';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

describe('getDeviceSaveMode', () => {
  it('sends an iPhone to Photos', () => {
    expect(getDeviceSaveMode(nav(IPHONE, 'iPhone', 5))).toBe('photos');
  });

  it('sends an iPad that reports itself as a Mac to Photos', () => {
    expect(isIOSDevice(nav(MAC, 'MacIntel', 5))).toBe(true);
    expect(getDeviceSaveMode(nav(MAC, 'MacIntel', 5))).toBe('photos');
  });

  it('downloads file by file on Android', () => {
    expect(getDeviceSaveMode(nav(ANDROID, 'Linux armv8l', 5))).toBe('files');
  });

  it('keeps the archive on a desktop, a real Mac included', () => {
    expect(getDeviceSaveMode(nav(WINDOWS, 'Win32'))).toBe('archive');
    expect(getDeviceSaveMode(nav(MAC, 'MacIntel', 0))).toBe('archive');
  });
});

describe('splitIntoBatches', () => {
  const items = (n: number, size = 1) => Array.from({ length: n }, (_, i) => ({ id: i + 1, size }));

  it('cuts by count', () => {
    const batches = splitIntoBatches(items(45), 20, Infinity);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(batches.flat().map((p) => p.id)).toEqual(items(45).map((p) => p.id));
  });

  it('closes a batch early when the next photo would pass the byte cap', () => {
    const batches = splitIntoBatches(items(5, 40), 20, 100);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it('still gives a photo larger than the cap a batch of its own', () => {
    const batches = splitIntoBatches([{ id: 1, size: 500 }, { id: 2, size: 1 }], 20, 100);
    expect(batches.map((b) => b.map((p) => p.id))).toEqual([[1], [2]]);
  });

  it('treats an unknown size as zero', () => {
    expect(splitIntoBatches([{ id: 1 }, { id: 2 }], 20, 1)).toHaveLength(1);
  });
});

describe('shareFiles', () => {
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  const original = { share: navigator.share, canShare: navigator.canShare };

  function stub(canShare: boolean, share: () => Promise<void>) {
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => canShare), configurable: true });
    Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
  }
  afterEach(() => {
    Object.defineProperty(navigator, 'canShare', { value: original.canShare, configurable: true });
    Object.defineProperty(navigator, 'share', { value: original.share, configurable: true });
  });

  it('calls share in the same tick, before any await, so the tap still counts', () => {
    stub(true, () => Promise.resolve());
    void shareFiles([file]);
    expect(navigator.share).toHaveBeenCalledWith({ files: [file] });
  });

  it('reports each way the share sheet can end', async () => {
    stub(true, () => Promise.resolve());
    await expect(shareFiles([file])).resolves.toBe('shared');

    stub(true, () => Promise.reject(new DOMException('closed', 'AbortError')));
    await expect(shareFiles([file])).resolves.toBe('dismissed');

    stub(true, () => Promise.reject(new DOMException('no gesture', 'NotAllowedError')));
    await expect(shareFiles([file])).resolves.toBe('needs-tap');

    stub(true, () => Promise.reject(new DOMException('bad', 'DataError')));
    await expect(shareFiles([file])).resolves.toBe('unsupported');
  });

  it('reports unsupported when the browser cannot share files', async () => {
    stub(false, () => Promise.resolve());
    await expect(shareFiles([file])).resolves.toBe('unsupported');
    expect(navigator.share).not.toHaveBeenCalled();
  });
});
