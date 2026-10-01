/**
 * The photo source a new event starts with (P5, spec 5.5): the PUT's rules,
 * applied to an event that has no earlier state.
 */
const { resolveCreatePhotoSource } = require('../../src/services/eventPhotoSource');

describe('resolveCreatePhotoSource', () => {
  const allow = jest.fn(async () => true);
  const deny = jest.fn(async () => false);
  beforeEach(() => { allow.mockClear(); deny.mockClear(); });

  it('defaults to managed and drops any folder fields', async () => {
    await expect(resolveCreatePhotoSource({ external_path: 'x', external_watch: true }, { canEnableWatch: deny }))
      .resolves.toEqual({ source_mode: 'managed', external_path: null, external_watch: false });
    expect(deny).not.toHaveBeenCalled();
  });

  it('keeps a trimmed folder in reference mode without asking for a permission', async () => {
    await expect(resolveCreatePhotoSource({ source_mode: 'reference', external_path: '  weddings/2026 ' }, { canEnableWatch: deny }))
      .resolves.toEqual({ source_mode: 'reference', external_path: 'weddings/2026', external_watch: false });
    expect(deny).not.toHaveBeenCalled();
  });

  it('refuses reference mode without a folder', async () => {
    await expect(resolveCreatePhotoSource({ source_mode: 'reference', external_path: '   ' }, { canEnableWatch: allow }))
      .rejects.toMatchObject({ statusCode: 400, code: 'EXTERNAL_PATH_REQUIRED' });
  });

  it('turns the watcher on only for an admin with photos.upload', async () => {
    const input = { source_mode: 'reference', external_path: 'a', external_watch: true };
    await expect(resolveCreatePhotoSource(input, { canEnableWatch: allow }))
      .resolves.toEqual({ source_mode: 'reference', external_path: 'a', external_watch: true });
    await expect(resolveCreatePhotoSource(input, { canEnableWatch: deny }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PHOTOS_UPLOAD_REQUIRED' });
  });
});
