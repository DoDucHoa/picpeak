import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { galleryService } from '../../../services/gallery.service';
import {
  getDeviceSaveMode, shareFiles, splitIntoBatches,
} from '../../../utils/deviceSave';
import type { DeviceSaveMode, ShareOutcome } from '../../../utils/deviceSave';

/** One photo to save, as the gallery already knows it. */
export interface SavePhoto {
  id: number;
  filename: string;
  /** Bytes of the original, used to keep a share batch within memory. */
  size?: number | null;
}

export interface DeviceSaveOptions {
  /** One of the gallery's download sizes (#858). Omitted = the standard size. */
  resolution?: string;
  /**
   * A single photo started from the viewer, which shows its own progress: no
   * sheet while fetching, and a dismissed share sheet simply ends the run.
   */
  quiet?: boolean;
  /** Progress of a quiet single photo, as fetchPhotoBlob reports it. */
  onProgress?: (fraction: number | null) => void;
}

/** What the progress sheet shows. Null while no sheet is up. */
export interface DeviceSaveSheet {
  mode: 'photos' | 'files';
  /** `fetching` while photos come in, `ready` while a batch waits for a tap. */
  phase: 'fetching' | 'ready';
  /** Photos fetched so far, across the whole run. */
  done: number;
  total: number;
  /** Zero-based. */
  batchIndex: number;
  batchCount: number;
  /** First and last photo of the waiting batch, one-based, inclusive. */
  from: number;
  to: number;
  /** The guest closed the share sheet without saving this batch. */
  dismissed: boolean;
}

export type DeviceSaveOutcome = 'done' | 'stopped';

export interface DeviceSave {
  mode: DeviceSaveMode;
  sheet: DeviceSaveSheet | null;
  /**
   * Saves the photos the way this device keeps them: into Photos on iOS,
   * as separate files on Android. Resolves when the run ends; rejects with
   * the request error when the server refuses a photo, so the caller can
   * answer a 402 or 403 the way it answers every other download.
   */
  run: (photos: SavePhoto[], options?: DeviceSaveOptions) => Promise<DeviceSaveOutcome>;
  /** The tap on "Save to Photos". Must stay synchronous up to the share call. */
  confirm: () => void;
  stop: () => void;
}

// Parallel requests while a batch is fetched. Enough to keep a phone's link
// busy without the browser queueing most of them anyway.
const FETCH_CONCURRENCY = 3;

class StoppedError extends Error {
  constructor() {
    super('stopped');
    this.name = 'StoppedError';
  }
}

function isCancellation(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return error instanceof StoppedError || name === 'CanceledError' || name === 'AbortError';
}

export function useDeviceSave(slug: string): DeviceSave {
  const mode = useMemo(() => getDeviceSaveMode(), []);
  const [sheet, setSheet] = useState<DeviceSaveSheet | null>(null);

  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // The batch waiting for a tap, and how to hand the share result back.
  const waitingRef = useRef<{ files: File[]; settle: (outcome: ShareOutcome | 'stopped') => void } | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    const waiting = waitingRef.current;
    waitingRef.current = null;
    waiting?.settle('stopped');
  }, []);

  // A run must not outlive the gallery: leaving cancels the transfers, and the
  // server refunds the allowance of every photo that had not finished.
  useEffect(() => stop, [stop]);

  const confirm = useCallback(() => {
    const waiting = waitingRef.current;
    if (!waiting) return;
    waitingRef.current = null;
    // Called straight from the click: shareFiles reaches navigator.share in
    // this same tick, so iOS accepts the tap as the gesture.
    shareFiles(waiting.files).then(waiting.settle);
  }, []);

  const waitForTap = useCallback((files: File[]) => (
    new Promise<ShareOutcome | 'stopped'>((settle) => {
      waitingRef.current = { files, settle };
    })
  ), []);

  const run = useCallback(async (
    photos: SavePhoto[],
    options: DeviceSaveOptions = {},
  ): Promise<DeviceSaveOutcome> => {
    if (busyRef.current || photos.length === 0 || mode === 'archive') return 'stopped';
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const { resolution, quiet = false, onProgress } = options;
    const total = photos.length;
    let done = 0;

    const fetchFile = async (photo: SavePhoto): Promise<File> => {
      const fetched = await galleryService.fetchPhotoBlob(
        slug, photo.id, quiet ? onProgress : undefined, { resolution, signal: controller.signal },
      );
      if (controller.signal.aborted) throw new StoppedError();
      const blob = fetched.blob;
      return new File([blob], fetched.serverFilename || photo.filename, { type: blob.type || 'image/jpeg' });
    };

    // Fetches `items` a few at a time, keeping their order, and hands each
    // file to `onFile` as it arrives. The first failure cancels the rest.
    const fetchAll = async (items: SavePhoto[], onFile: (file: File, index: number) => void) => {
      const files: File[] = new Array(items.length);
      let next = 0;
      const worker = async () => {
        for (let index = next++; index < items.length; index = next++) {
          if (controller.signal.aborted) throw new StoppedError();
          const file = await fetchFile(items[index]);
          files[index] = file;
          done += 1;
          onFile(file, index);
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, worker));
      } catch (error) {
        controller.abort();
        throw error;
      }
      return files;
    };

    try {
      if (mode === 'files') {
        const show = () => setSheet({
          mode: 'files', phase: 'fetching', done, total, batchIndex: 0, batchCount: 1, from: 1, to: total, dismissed: false,
        });
        if (!quiet) show();
        await fetchAll(photos, (file) => {
          galleryService.triggerBrowserDownload(file, file.name);
          if (!quiet) show();
        });
        return 'done';
      }

      const batches = splitIntoBatches(photos);
      let from = 1;
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const base = {
          mode: 'photos' as const, total, batchIndex, batchCount: batches.length,
          from, to: from + batch.length - 1, dismissed: false,
        };
        if (!quiet) setSheet({ ...base, phase: 'fetching', done });
        const files = await fetchAll(batch, () => {
          if (!quiet) setSheet({ ...base, phase: 'fetching', done });
        });

        // The first batch tries the share sheet straight away: if fetching was
        // quick, the tap that started the run still counts. Every later batch
        // follows a share sheet that already used that tap up.
        let outcome: ShareOutcome | 'stopped' = batchIndex === 0 ? await shareFiles(files) : 'needs-tap';
        while (outcome === 'needs-tap' || outcome === 'dismissed') {
          // From the viewer, closing the share sheet is the guest's answer.
          if (outcome === 'dismissed' && quiet) return 'stopped';
          setSheet({ ...base, phase: 'ready', done, dismissed: outcome === 'dismissed' });
          outcome = await waitForTap(files);
        }
        if (outcome === 'stopped') return 'stopped';
        // A browser that cannot share files at all (an in-app browser, say)
        // still gets the photos, as plain downloads.
        if (outcome === 'unsupported') {
          files.forEach((file) => galleryService.triggerBrowserDownload(file, file.name));
        }
        from += batch.length;
      }
      return 'done';
    } catch (error) {
      if (isCancellation(error) && controller.signal.aborted) return 'stopped';
      throw error;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      waitingRef.current = null;
      busyRef.current = false;
      setSheet(null);
    }
  }, [mode, slug, waitForTap]);

  return useMemo(() => ({ mode, sheet, run, confirm, stop }), [mode, sheet, run, confirm, stop]);
}
