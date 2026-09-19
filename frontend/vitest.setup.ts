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
