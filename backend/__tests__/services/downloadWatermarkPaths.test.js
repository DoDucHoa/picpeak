/**
 * Every download path asks the one resolver. Three of them used to inline
 * the old "global OR event" rule and would keep watermarking downloads after
 * the resolver changed.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src');
const DOWNLOAD_PATHS = [
  'routes/gallery/downloads.js',
  'services/downloadZipService.js',
  'services/downloadJobService.js',
];

describe.each(DOWNLOAD_PATHS)('%s', (rel) => {
  const src = fs.readFileSync(path.join(SRC, rel), 'utf8');

  it('never decides a download watermark from the event flag', () => {
    expect(src).not.toMatch(/watermark_downloads/);
    expect(src).not.toMatch(/watermark_text/);
  });

  it('never reads the raw watermark settings for a download', () => {
    expect(src).not.toMatch(/getWatermarkSettings\(/);
  });

  it('goes through resolveWatermarkSettings', () => {
    expect(src).toMatch(/resolveWatermarkSettings\(/);
  });
});
