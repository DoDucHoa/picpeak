import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Provide Jest-compatible globals for existing tests that rely on jest.fn
(globalThis as any).jest = vi;

// vitest's jsdom environment replaces AbortController with jsdom's, but leaves
// Request as Node's own, and Node's Request refuses any signal that is not a
// Node AbortSignal: "RequestInit: Expected signal to be an instance of
// AbortSignal". A data router builds a Request with a jsdom signal for every
// navigation, so every test that navigated a memory router threw on the first
// navigate() and sat red as if the page were broken.
//
// The request is never sent (a client-side router only reads it), so it is
// built without the foreign signal and the signal is put back as an own
// property. The router keeps reading `request.signal.aborted` and listening
// for "abort" on the very signal it aborts, so an interrupted navigation is
// still discarded the way it is in a browser.
//
// The refusal is probed rather than detected with instanceof: Node checks
// against the AbortSignal it captured at startup, which no global still
// names, so `instanceof AbortSignal` passes for a signal it then rejects.
const refusesTestSignals = (() => {
  if (typeof Request === 'undefined' || typeof AbortController === 'undefined') return false;
  try {
    new Request('http://localhost/', { signal: new AbortController().signal });
    return false;
  } catch {
    return true;
  }
})();
if (refusesTestSignals) {
  const NativeRequest = Request;
  class SignalBridgingRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const signal = init?.signal;
      if (signal) {
        const rest = { ...init };
        delete rest.signal;
        super(input, rest);
        Object.defineProperty(this, 'signal', { value: signal, configurable: true });
      } else {
        super(input, init);
      }
    }
  }
  globalThis.Request = SignalBridgingRequest as typeof Request;
}

// jsdom's Blob only implements `.slice()` — unlike every real browser (and
// Node's own Blob), it has no `.text()`/`.arrayBuffer()`. Code that reads a
// blob-wrapped error body (axios `responseType: 'blob'` on a 402/403, used
// throughout the gallery's download-quota flow) needs `.text()` to work the
// same in tests as it does in production.
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// Node 22 added a built-in `localStorage`/`sessionStorage` global, gated on the
// process being started with `--localstorage-file <path>`. Node 25 installs the
// accessors regardless, and without that flag they resolve to nothing: hence
// the "`--localstorage-file` was provided without a valid path" warning on
// every worker. Because vitest's jsdom environment uses globalThis as the
// window, those accessors shadow the Storage jsdom would otherwise provide, so
// `window.localStorage` is the same empty thing. Every test touching storage
// died on `localStorage.clear is not a function`, which reads like a broken
// test rather than a broken environment and is why it sat red.
//
// A spec-shaped in-memory Storage is enough here and is better than reaching
// into jsdom's internals for the shadowed one: these suites test our own
// wrappers, and the behaviours they care about are string coercion, a missing
// key reading back as null, and `length`/`key()` tracking the store.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    const value = this.store.get(String(key));
    return value === undefined ? null : value;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const existing = (globalThis as unknown as Record<string, Storage | undefined>)[name];
  // Only stand in where the environment left nothing usable, so a future Node
  // or jsdom that supplies a real Storage keeps it.
  if (!existing || typeof existing.clear !== 'function') {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
