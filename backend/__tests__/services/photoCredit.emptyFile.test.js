/**
 * exifr opens the file and, on a file too short to hold any metadata, throws
 * without closing its handle. Node 22 closes it at garbage collection with a
 * warning; Node 25 raises an error inside whichever code runs at that moment,
 * which in this suite meant a random, unrelated test failing. A file that
 * small cannot carry a credit, so it is never handed to exifr.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const exifr = require('exifr');
const { extractExifCredit } = require('../../src/services/photoCredit');

describe('extractExifCredit on a file too small to hold metadata', () => {
  let file;
  beforeEach(() => {
    file = path.join(os.tmpdir(), `photo-credit-empty-${process.pid}.jpg`);
    fs.writeFileSync(file, '');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    try { fs.unlinkSync(file); } catch { /* already gone */ }
  });

  it('returns no credit without handing the file to exifr', async () => {
    const parse = jest.spyOn(exifr, 'parse');
    await expect(extractExifCredit(file)).resolves.toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('still returns no credit for a missing file', async () => {
    await expect(extractExifCredit(path.join(os.tmpdir(), 'photo-credit-missing.jpg'))).resolves.toBeNull();
  });
});
