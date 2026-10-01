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

// Nothing decides anything from the per-event flag any more. The column
// stays, so a few places may still define, validate, store or copy it; any
// other mention is a reader that would bring the flag back to life.
describe('the per-event download watermark flag', () => {
  const ALLOWED_FILES = new Set([
    'database/db.js', // schema and the SQLite column list
    'services/eventCreationService.js', // stores it on create
    'services/eventCreationValidation.js', // boolean field list
    'usage/expandedSnapshot.js', // anonymous usage signal, not a decision
  ]);
  const ALLOWED_LINES = [
    /body\('watermark_downloads'\)\.optional\(\)\.isBoolean\(\)/, // input validation
    /watermark_downloads: source\.watermark_downloads,/, // duplicating an event copies the column
    /watermark_downloads: .*'branding_watermark_downloads_enabled'/, // a payload field resolved from Branding
  ];

  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return walk(full);
    return d.name.endsWith('.js') ? [full] : [];
  });

  it('is read nowhere outside the places that store it', () => {
    const readers = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED_FILES.has(rel)) continue;
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!/\bwatermark_downloads\b/.test(line)) return;
        if (ALLOWED_LINES.some((re) => re.test(line))) return;
        readers.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(readers).toEqual([]);
  });

  it('scans real files (control)', () => {
    const creation = fs.readFileSync(path.join(SRC, 'services/eventCreationService.js'), 'utf8');
    expect(creation).toMatch(/\bwatermark_downloads\b/);
  });
});
