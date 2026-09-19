import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Provide Jest-compatible globals for existing tests that rely on jest.fn
(globalThis as any).jest = vi;

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
