# Client gallery redesign: one fixed design, no gallery theming

Date: 2026-10-01
Status: draft, awaiting operator review

## Goal

The gallery a customer opens from a share link looks and behaves like the
reference album at `huyhiep.gump.gg/album/couple-1790769435395`. The operator no
longer picks a layout, a preset or custom CSS for a gallery: every gallery gets
the same design. It stays smooth on albums of several thousand photos, on a
low-end phone as much as on a desktop.

## Decisions taken with the operator

| Question | Decision |
|---|---|
| Old gallery theming and the seven layouts | Delete the code in this change |
| Brand colours, fonts and logo used by the admin and the customer portal | Keep. The Branding page shrinks to those |
| Database columns and the `css_templates` table that only served gallery theming | Drop them in this change |
| Features copied from the reference | Like, pick, download (all or multi-select), sort with direction, expiry notice, share link, comments and file info in the viewer, list view |
| Not copied | Curate, versions, draw, activity log (no backend for any of them) |
| Cover photo | The hero photo the admin already chose, else the first photo |
| PicPeak features the reference lacks | Keep, folded into the toolbar as icons: download quota, the "get all photos" order offer, people filter, folders, client-access banner |

## The reference, measured

Measured with Playwright at 1440x900 and 390x844 on 2026-10-01.

**Cover.** One photo, `object-fit: cover`, full viewport height. Album title
bottom left in DM Serif Display (about 64px desktop), photographer name under it
in Red Hat Display. "View Album" outlined pill button bottom right, white
border, white text. Language picker top right. A dark gradient at the bottom
keeps the text legible. "View Album" scrolls to the grid.

**Expiry notice.** A dark rounded pill, fixed at the top centre, info icon,
"Your album expires on 07 Oct 2026" with the date in bold, a close button.
Dismissal is remembered per gallery for the browser session.

**Toolbar.** Row one: tabs "Total 205", "Like 0" (red heart), "Pick 9 / 205"
(blue check badge). The active tab has an orange underline. Share and comment
icons on the right. Row two, right aligned: Download (menu: all, multi-select),
sort direction chevron, sort field (menu), view mode toggle. Once the cover is
scrolled past, the toolbar sticks to the top and collapses row two into icons.

**Grid.** White background. Masonry by shortest column, photos keep their own
aspect ratio, no radius, no shadow. Order runs left to right across the top row,
as a shortest-column fill does.

| Viewport | Columns | Gap | Side padding |
|---|---|---|---|
| 1440 px | 3 | 12 px | 60 px |
| 390 px | 2 | 4 px | 6 px |

Breakpoints between those two are ours to choose: 2 columns under 768px, 3 from
768px, 4 from 1920px.

**Tile hover.** Top left: outline heart plus like count. Top right: outline
check circle. A liked or picked tile keeps its badge visible without hover.
In multi-select mode a selection checkbox shows on every tile.

**List view.** Rows of 150px: thumbnail (80px wide), file name, dimensions
(`5152 × 7728`), file size (`24.3 MB`), and like and pick buttons. 1px divider
between rows.

**Viewer.** White background, photo centred and contained. A vertical icon rail
on the left: back (orange), like, pick, divider, comment, file info. A
filmstrip of small thumbnails along the bottom. Keyboard arrows and swipe step
through photos; the URL carries the photo so a link opens it directly.

**Type.** Red Hat Display for all UI text, DM Serif Display for the album title.
Both from Google Fonts, `display=swap`. The gallery does not follow the brand
colours: its palette is fixed (white, near black text `#1a1a1a`, orange accent
`#f08a24`, like red `#f0524f`, pick blue `#3b5bdb`).

## Mapping onto PicPeak

| Reference | PicPeak backing |
|---|---|
| Like | Feedback likes (`allow_likes`, `like_count`, `is_liked`) |
| Pick N / Total | Feedback favorites (`allow_favorites`), limit `max_favorites_per_guest`. With no limit the tab shows "Pick N" only |
| Comment | Feedback comments (`allow_comments`), existing `PhotoComments` |
| File info | `original_filename` (when `use_original_filenames`), `width`, `height`, `size`, `captured_at` |
| Sort by creation time / file name / last upload | `capture_date` / `name` / `date` from `useGalleryFiltering` |
| Download all / multi-select | Existing `download-all` and `download-selected`, through the download gate and quota |
| Share | Copy the gallery link, using the Web Share API where present |

The pick tab counts the viewer's own picks, so `/photos` gains a per-viewer
`is_favorited` flag computed exactly like `is_liked` (guest id when a verified
guest token is present, else the IP and user agent identifier, hidden rows
excluded, not gated on `show_feedback_to_guests`).

Like and pick update the photos cache in place (`setQueryData`) instead of
invalidating it: invalidating refetches every page of a large album on each
tap.

A tab, button or rail icon whose feedback switch is off for the event is not
rendered.

From the old header and footer, three things survive: the logout control
(a toolbar icon, shown under the same rule as today: password gallery, client
PIN session or customer portal session), the info and promo markdown (rendered
as plain text blocks below the grid when set), and the gallery hero logo (top
left of the cover, when `hero_logo_visible`). The social links footer, the
company tagline row and the countdown timer go; the expiry notice covers the
countdown's job. Rating, reactions and colour labels are not part of the design; their
data stays in the backend and the admin still sees them.

## Architecture

New code lives in `frontend/src/features/client-gallery/`, which keeps the new
design separate from the leftovers being deleted.

```text
GalleryPage (unchanged gate: resolve, password, expired, skeleton)
  └─ ClientGallery                    orchestrator, replaces GalleryView
       ├─ providers: GuestIdentity, DownloadGate, DownloadedPhotos (kept)
       ├─ CoverHero                   full-viewport cover, title, View Album
       ├─ ExpiryToast
       ├─ GalleryToolbar              tabs, share, download menu, sort, view toggle,
       │                              quota badge, order offer, people, folders
       ├─ ClientAccessBanner          (kept logic, restyled)
       ├─ MasonryGrid | PhotoList     virtualised, see Performance
       │    └─ GridTile / ListRow
       ├─ PhotoViewer                 YARL based, left rail, filmstrip
       └─ kept modals: DownloadResolution, DownloadQuota, PeopleSheet,
          GuestNamePrompt, GuestRecovery, FeedbackIdentity, FeedbackLimitReached
```

State that the URL carries: `?sort=capture_date&dir=asc&view=grid|list&tab=all|liked|picked&folder=…&photo=<id>`.
Everything else is component state.

Data is unchanged: `useGalleryInfo`, `useGalleryPhotos` (all pages fetched up
front, four at a time), `useGalleryFiltering` for sort and filters,
`useGallerySelection` for multi-select, the existing feedback mutations and the
download hooks. The quota rule in the repo `CLAUDE.md` holds: every bulk download
path calls `useRefreshDownloadQuota`, and `bulkDownloadChargesQuota.test.ts`
lists the new call sites.

### Image protections stay

`protection_level`, `disable_right_click`, `enable_devtools_protection`,
`use_canvas_rendering` and the watermark URL rewrite keep working exactly as
today. Tiles render through `AuthenticatedImage`; the viewer renders the current
slide through `AuthenticatedImage` with canvas rendering when the event asks for
it, as `PremiumLightboxImage` does today. `useDevToolsProtection` and the
context-menu block move into `ClientGallery`.

## Performance

1. **Virtualised masonry.** `@tanstack/react-virtual` with `useWindowVirtualizer`
   and `lanes` set to the column count. Each tile's height is computed from
   `width` and `height` before it loads (fallback ratio 2:3 when either is
   missing), so nothing reflows as images arrive and the scrollbar is right from
   the first paint. Overscan of about one viewport. Only visible tiles plus the
   overscan exist in the DOM, whatever the album size.
2. **Virtualised list view.** Same virtualiser, fixed 150px rows.
3. **Right sized, uncropped tile images.** Thumbnails are square crops
   (`thumbnail_fit` is seeded to `cover`), so a masonry tile at the photo's own
   ratio cannot use them. Tiles use the preview rendition (`slideshow_url`,
   aspect preserved) at the smallest of 640 or 1280 px that covers the measured
   column width times the device pixel ratio, through a new `tilePreviewUrl`
   helper beside `thumbnailUrlForTile`, with the same data-saver downshift. One
   URL per tile, not a `srcset`: `AuthenticatedImage` fetches its `src` with the
   gallery bearer token, and a `srcset` would make the browser issue its own
   unauthenticated request. Videos keep `thumbnail_url`. The first row is
   fetched at `queuePriority="high"`, the rest at `normal`.
4. **Placeholder colour.** Tiles show a neutral `#f2f2f2` box until the image
   decodes, then fade in with opacity only (no layout animation).
5. **Viewer mounts three slides.** YARL renders the current slide and its two
   neighbours only, and uses `lightboxImageUrl` for a viewport sized preview,
   never the original. The filmstrip is a horizontal virtualiser over 300px
   thumbnails.
6. **Cheap tiles.** Hover badges are CSS only (`:hover`, `group-hover`), no
   per-tile React state for hover. Like and pick counts come from the photos
   query and update through the existing mutations' cache writes.
7. **No heavy animation.** No framer-motion in the new tree.
   `content-visibility` is not needed once the grid is virtualised.

Acceptance numbers, measured with Playwright on a seeded 2000-photo gallery at
CPU throttle 4x: DOM node count under 3000 at any scroll position, no long task
over 100ms while scrolling, cumulative layout shift under 0.05 on the grid.

## What is deleted

### Frontend

- `components/gallery/layouts/` in full: Grid, Masonry, Carousel, Timeline,
  Mosaic, Justified, GalleryPremium, GalleryStory, `story/`,
  `PremiumLightboxImage` (its logic moves into `PhotoViewer`),
  `BaseGalleryLayout`.
- `GalleryView`, `GalleryLayout`, `PhotoGridWithLayouts`, `PhotoGrid`,
  `PhotoLightbox`, `PhotoCard`, `HeroHeader`, `HeroDivider`, `GallerySidebar`,
  `PhotoFilterBar`, `GalleryFilter`, `ColorLabelFilterChips`, `ExpirationBanner`
  and `CountdownTimer` once nothing imports them. Components the new tree keeps
  using (feedback widgets, modals, `PeopleStrip`, `PeopleSheet`,
  `GalleryFolderTiles`, `DownloadQuotaBadge`, `DownloadQuotaDialog`,
  `VideoPlayer`, `faceCrop`, `imageTiers`, `folders`, `downloadQuotaOffer`)
  stay where they are.
- `pages/gallery/PreviewPage.tsx` and its `/gallery/preview` route.
- `hooks/useGalleryCustomCss.ts`.
- Admin: `ThemeCustomizerEnhanced`, `ThemeEditorModal`, `ThemeDisplay`,
  `GalleryPreview`, `theme-customizer/` except what Branding still needs
  (colour fields, typography, force colour mode), `CssTemplateEditor` and the
  Settings > Styling tab, `EventThemeSection`, `ThemePresetPicker`,
  `storedThemeKind`, the theme parts of `AppearanceSection`, `DetailsSection`,
  `createForm`, `serverValues`, `saveDraft`, the Default Theme select on the
  Event Types page.
- `types/theme.types.ts` loses `GalleryLayoutType`, `GalleryLayoutSettings`,
  `HeaderStyleType`, `HeroDividerStyle`, the gallery presets and the gallery
  fields of `ThemeConfig`. What remains is a `BrandTheme` type: colours,
  fonts, font size, border radius, shadow, colour mode, logo.
- `ThemeContext` keeps applying brand tokens app wide and stops reading anything
  gallery specific. `GlobalThemeProvider` keeps its job. The gallery no longer
  calls `setTheme`; it sets its own fixed tokens on its root element, so a
  gallery visit no longer leaks into the next page, and the
  `gallery-theme-bg-<slug>` bootstrap key goes.
- i18n: theme and layout keys under `branding.*`, `cssTemplates.*` and the
  `events.*` theme keys, removed from all nine locale files. New gallery strings
  are added to `en`, `de` and `vi`.

### Backend

- `routes/adminCssTemplates.js`, `routes/gallery/styles.js` and their mounts.
- `color_theme`, `css_template_id`, `header_style`, `hero_divider_style` removed
  from event create, update, duplicate, archive, the v1 events API, the gallery
  login responses, `/info`, `/photos` and the slideshow payload, along with
  their validators.
- `theme_preset` and `theme_config` removed from event types.
- `PUT /admin/settings/theme` keeps working for brand fields and strips gallery
  keys it receives. `publicSiteService` keeps reading the brand colours.
- The `custom_css` usage signal and its coverage entries go.

### Database: migration `263_drop_gallery_theming.js`

| Change | Detail |
|---|---|
| `events` | drop `color_theme`, `css_template_id`, `header_style`, `hero_divider_style` |
| `event_types` | drop `theme_preset`, `theme_config` |
| `css_templates` | drop table |
| `app_settings.theme_config` | rewrite in place, keeping brand keys only |

Every step is guarded (`hasColumn`, `hasTable`) so a partly migrated install
converges. `down()` recreates the columns and the table empty: the dropped data
does not come back from a migration, only from a backup.

> [!CAUTION]
> The drop is irreversible without a database restore. The `deploy-nas` skill
> takes a backup before it migrates, and that backup is the only rollback path
> for this release. Rolling the image back without restoring it leaves the old
> code reading columns that no longer exist.

## Testing

- Vitest, new: grid lane assignment and tile heights from dimensions, the
  ratio fallback, URL state round trip, tab counts and the pick limit, the
  toolbar hiding what feedback settings disable, viewer keyboard navigation,
  canvas rendering in the viewer when `use_canvas_rendering` is on, every bulk
  download path refetching the quota.
- Vitest, updated: the source-scanning guards (`bulkDownloadChargesQuota`,
  `protectionLevelNoImplications`, `canvasLightboxOnly`, `noGuestUploads`)
  point at the new files; admin tests lose their theme assertions.
- Vitest, deleted: tests of deleted layouts and the customizer.
- Jest: migration 263 up and down on Postgres, guarded re-run; event create and
  update no longer accept the theme fields; the theme settings route strips
  gallery keys.
- Playwright: a new spec covering cover, View Album, grid, like, pick with
  limit, multi-select download, sort, list view, viewer and filmstrip, on
  desktop and mobile viewports. Specs for deleted features
  (`gallery-premium-select-all`, `header-hero-fixes`, the customizer part of
  `dark-mode`) are removed. The performance numbers above run as a spec on a
  seeded large gallery.
- Visual check against the reference screenshots at 1440 and 390 wide.

## Out of scope

Curate, photo versions, drawing on photos, the activity log, guest uploads,
reveal, ratings and reactions in the gallery UI, and any change to the admin
photo manager.
