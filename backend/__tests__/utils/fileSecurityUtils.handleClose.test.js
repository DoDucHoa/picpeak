/**
 * validateFileContent opened the upload, read its first bytes and closed it
 * only on the success path. A read that fails (on Windows, for one, a file
 * unlinked while open) left the handle to the garbage collector, which Node 25
 * now reports as an error inside whichever test happens to be running.
 */
const fs = require('fs').promises;
const { validateFileContent } = require('../../src/utils/fileSecurityUtils');

describe('validateFileContent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('closes the file handle when the read fails', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(fs, 'open').mockResolvedValue({
      read: jest.fn().mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })),
      close,
    });

    await expect(validateFileContent('upload.jpg', 'image/jpeg')).resolves.toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
