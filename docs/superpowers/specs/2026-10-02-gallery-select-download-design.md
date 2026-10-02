# Gallery: select-first downloads, viewer progress, sticky toolbar fix

Date: 2026-10-02. Scope: the client gallery (`frontend/src/features/client-gallery`)
and the gallery download routes (`backend/src/routes/gallery/downloads.js`).

## Problems

1. The viewer's download button gives no feedback. The photo is fetched as a blob
   before the save dialog appears, which takes seconds for a large original, and a
   second tap starts a second download. The success toast is hardcoded English.
2. Scrolling past the cover locks the page. When the toolbar sentinel leaves the
   viewport the toolbar folds from two rows (120px) to one (60px). Scroll anchoring
   then pulls the page back by the same 60px, the sentinel re-enters, the toolbar
   unfolds, and the cycle repeats. Measured in Chromium at 1440x900: the scroll
   position oscillated between 860 and 920 and settled at 880, below the fold point.
3. The toolbar's Download menu duplicates what selection mode should own.

## Decisions (agreed with the operator)

- Viewer download keeps its button and shows a progress ring with a percentage while
  the photo downloads, locked against a second tap. When the server sends no
  Content-Length the ring spins without a number. Success and failure toasts are
  translated (`en`, `de`, `vi`).
- The toolbar loses the Download menu. Select is shown to clients and to anyone
  allowed to download.
- The selection bar holds: count, Select all, Download, Hide Selected and Show
  Selected (clients), Get all photos (when the allowance no longer fits the
  gallery), Cancel. Each carries an icon and a label; the label hides in the compact
  bar and at phone width, like every other toolbar control.
- Select all selects what is on screen (open folder, tab, people filter). Pressed
  again it clears the selection. It replaces the menu's folder and people entries.
- One selected photo downloads as a file. Two or more download as ZIP archives, with
  no cap on the number of photos. The server splits the selection into parts of at
  most 2 GB each by stored file size, and the browser downloads the parts one after
  another.
- The toolbar keeps its fold, without the feedback loop.

## Design

### Sticky toolbar

The fold changes the toolbar's height, and that height change is what scroll
anchoring compensates for. While folded, the toolbar gets a bottom margin equal to
the height it lost, so the content after it never moves and anchoring has nothing to
correct. The margin is transparent, so photos scroll up through it and under the bar.
The full height is measured while unfolded with a ResizeObserver.

### Viewer progress

`galleryService.fetchPhotoBlob` accepts an optional progress callback, wired to
axios `onDownloadProgress`. `ViewerRail` keeps a per-photo download state, so
stepping to another photo shows that photo's own button, and stepping back shows the
progress still running.

### Download bundles (backend)

- `POST /api/gallery/:slug/download-bundles` with `{ photo_ids, resolution? }`. It
  runs the same deliverable-photos query as `download-selected`, checks the
  allowance for the whole set without claiming it, splits the result into parts of
  at most 2 GB by `size_bytes` (a single larger photo gets a part of its own), and
  returns `{ parts: [{ token, photo_count, size_bytes }] }`.
- `GET /api/gallery/:slug/download-bundles/:token` streams one part as a ZIP. The
  token is bound to the event and the visibility scope it was issued under, expires
  after an hour, and never grants access on its own: `verifyGalleryAccess` still
  runs and the photo list is re-filtered through the deliverable-photos query. The
  allowance is claimed here, before the first byte, exactly like `download-selected`.
  A `HEAD` probe checks the allowance without claiming it.
- Parts live in an in-memory map. The backend is a single process, and a lost token
  after a restart answers 410, which the client reports as a failed download.
- The streaming body is shared with `download-selected` rather than copied.

Archives stream without a Content-Length, so the progress of a ZIP is shown by the
browser's own download bar. Buffering a 2 GB part in page memory to draw our own ring
would crash a phone.

### Download bundles (frontend)

`handleDownloadSelected`: one photo goes through `downloadPhoto`; two or more call
the bundle endpoint, probe each part with `HEAD` (a 402 opens the quota dialog), and
hand each part to the browser as a native download with a short gap between them. A
toast lists every part as a button for the case where the browser blocks the later
downloads. The allowance is re-read after the parts are handed over. With a
resolution choice enabled, the picker passes the chosen size into the same bundle
request instead of starting a capped job.

### Removed

`DownloadMenu.tsx`, and the controller's download-all, folder and people download
handlers, which only that menu called.
