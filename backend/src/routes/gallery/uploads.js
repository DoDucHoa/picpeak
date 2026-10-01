const express = require('express');

const router = express.Router();
const { verifyGalleryAccess, denySlideshowToken } = require('../../middleware/gallery');

/**
 * Guest uploads are removed (event form redesign P3, spec 5.12). The route
 * stays so an old gallery tab gets a clear refusal instead of a 404, whatever
 * the event's stored allow_user_uploads says. The processing status route went
 * with the gallery's upload poller, its only caller. The columns keep their
 * values, so a rollback is a code revert.
 */
router.post('/:eventId/upload', verifyGalleryAccess, denySlideshowToken, (req, res) => {
  res.status(403).json({ error: 'Guest uploads are not available' });
});

module.exports = router;
