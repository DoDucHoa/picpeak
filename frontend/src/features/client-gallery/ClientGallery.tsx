import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import './galleryTokens.css';
import { Button, MarkdownContent } from '../../components/common';
import { LanguageSelector } from '../../components/common/LanguageSelector';
import { GallerySkeleton } from '../../components/gallery/GallerySkeleton';
import { PasswordChangeRequiredNotice } from '../../components/gallery/PasswordChangeRequiredNotice';
import { GalleryFolderTiles } from '../../components/gallery/GalleryFolderTiles';
import { GuestNamePromptModal } from '../../components/gallery/GuestNamePromptModal';
import { GuestRecoveryModal } from '../../components/gallery/GuestRecoveryModal';
import { DownloadResolutionModal } from '../../components/gallery/DownloadResolutionModal';
import { DownloadQuotaDialog } from '../../components/gallery/DownloadQuotaDialog';
import { PeopleSheet } from '../../components/gallery/PeopleSheet';
import { GuestIdentityProvider } from '../../contexts/GuestIdentityContext';
import { DownloadedPhotosProvider } from '../../contexts/DownloadedPhotosContext';
import { DownloadGateProvider } from '../../contexts/DownloadGateContext';
import { isAdminSessionExpired, isPasswordChangeRequired } from '../../utils/passwordChangeRequired';
import { copyText } from '../../utils/copyText';
import { useGalleryController } from './state/useGalleryController';
import type { GalleryController, GalleryEventSeed } from './state/useGalleryController';
import { useFeedbackToggle } from './state/useFeedbackToggle';
import { useViewerPhotos } from './state/useViewerPhotos';
import { CoverHero } from './cover/CoverHero';
import { ExpiryToast } from './cover/ExpiryToast';
import { GalleryToolbar } from './toolbar/GalleryToolbar';
import { MasonryGrid } from './grid/MasonryGrid';
import { PhotoList } from './list/PhotoList';
import { PhotoViewer } from './viewer/PhotoViewer';
import { ArrowUpIcon, ShieldIcon } from './icons';

interface ClientGalleryProps {
  slug: string;
  /** Must keep its identity across renders: the controller memoises on it. */
  event: GalleryEventSeed;
  requiresPassword?: boolean;
}

/** The address shared from the toolbar: the gallery itself, no photo or tab. */
function shareUrl(): string {
  return window.location.origin + window.location.pathname;
}

/** Visible once the page has scrolled more than one screen down. */
function useScrolledPastFirstScreen(): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const update = () => setPast(window.scrollY > window.innerHeight);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return past;
}

/**
 * The client gallery: cover, toolbar, the album as a grid or a list, and the
 * viewer. Everything it shows comes off the controller; this file only lays
 * it out and wires the handlers.
 */
export function ClientGallery({ slug, event, requiresPassword = false }: ClientGalleryProps) {
  const { t } = useTranslation();
  const c = useGalleryController(slug, event, requiresPassword);

  // Authentication failed: log out and let the parent ask again. In an effect,
  // since logging out updates the auth context and a render must not. An
  // admin preview whose admin session idled out is handled below instead:
  // logging a guest session out would leave the preview blank.
  const sessionRejected = !c.isLoading
    && (c.error as { response?: { status?: number } } | null)?.response?.status === 401
    && !isAdminSessionExpired(c.error);
  const { logout } = c;
  useEffect(() => {
    if (sessionRejected) logout();
  }, [sessionRejected, logout]);

  if (c.isLoading) {
    return <GallerySkeleton />;
  }

  if (c.error || !c.data) {
    // An admin preview whose admin session idled out: offer to sign in again.
    // Logging a guest session out would leave the preview blank.
    if (isAdminSessionExpired(c.error)) {
      return <PasswordChangeRequiredNotice reason="session" />;
    }

    if (sessionRejected) return null;

    if (isPasswordChangeRequired(c.error)) {
      return <PasswordChangeRequiredNotice />;
    }

    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-theme">{t('gallery.failedToLoad')}</p>
          <Button onClick={() => c.refetch()} className="mt-4">
            {t('gallery.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <GuestIdentityProvider slug={slug} identityMode={c.identityMode}>
      <DownloadedPhotosProvider value={c.deliveredPhotoIds}>
        <DownloadGateProvider value={c.downloadGate}>
          <ClientGalleryBody c={c} />
        </DownloadGateProvider>
      </DownloadedPhotosProvider>
    </GuestIdentityProvider>
  );
}

/** The loaded gallery. Split out so the feedback hook runs inside the guest identity provider. */
function ClientGalleryBody({ c }: { c: GalleryController }) {
  const { t } = useTranslation();
  const fs = c.feedbackSettings;
  const allowLikes = !!fs?.feedback_enabled && !!fs?.allow_likes;
  const allowPicks = !!fs?.feedback_enabled && !!fs?.allow_favorites;
  const { toggle, modals, blocking: feedbackBlocking } = useFeedbackToggle(
    c.slug, c.photosQueryKey, !!fs?.require_name_email, fs?.show_feedback_to_guests !== false,
  );

  // A tab whose feedback switch is off is not rendered, so a URL still naming
  // it would leave the viewer on a tab they cannot see or leave. Judged only
  // once the settings have loaded: before that every tab reads as off.
  const { setTab } = c;
  const tab = c.url.tab;
  const settingsLoaded = fs !== undefined;
  useEffect(() => {
    if (!settingsLoaded) return;
    if ((tab === 'liked' && !allowLikes) || (tab === 'picked' && !allowPicks)) setTab('all');
  }, [settingsLoaded, tab, allowLikes, allowPicks, setTab]);

  // YARL makes everything outside its portal inert while open, every dialog
  // of this page included. A download refused from the viewer raises the
  // quota dialog, and a like or pick can raise the guest name prompt, the
  // name and email form or the limit notice, so the viewer steps aside the
  // moment one of them appears.
  const latestViewer = useRef({ photo: c.url.photo, closePhoto: c.closePhoto });
  latestViewer.current = { photo: c.url.photo, closePhoto: c.closePhoto };
  const dialogOpen = c.quotaOffer !== null || feedbackBlocking;
  useEffect(() => {
    if (dialogOpen && latestViewer.current.photo !== null) latestViewer.current.closePhoto();
  }, [dialogOpen]);

  // The viewer holds the album order it opened on (see useViewerPhotos). A
  // photo deleted from the gallery altogether has nothing left to show, so
  // the viewer closes rather than leaving ?photo= behind.
  const viewerPhotos = useViewerPhotos(c.url.photo, c.visiblePhotos, c.data?.photos);
  const openPhotoGone = c.url.photo !== null && !!c.data && !c.data.photos.some((p) => p.id === c.url.photo);
  useEffect(() => {
    if (openPhotoGone) latestViewer.current.closePhoto();
  }, [openPhotoGone]);

  // Only the grid can tick photos, so starting a selection in the list moves
  // the album to the grid rather than leaving rows nobody can select.
  const { setView } = c;
  const selecting = c.selection.active;
  const view = c.url.view;
  useEffect(() => {
    if (selecting && view === 'list') setView('grid');
  }, [selecting, view, setView]);

  // Stable handlers: the grid, the list and the viewer memoise on them.
  const { openPhoto } = c;
  const openFromAlbum = useCallback((id: number) => openPhoto(id), [openPhoto]);
  const stepInViewer = useCallback((id: number) => openPhoto(id, 'replace'), [openPhoto]);
  const selectionRef = useRef(c.selection);
  selectionRef.current = c.selection;
  const toggleSelected = useCallback((id: number) => {
    const { ids, setIds } = selectionRef.current;
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIds(next);
  }, []);

  // Client mode (#172). The controller's toggle is already stable; wrapped so
  // the tiles get a void handler and the rejection stays handled there.
  const { toggleVisibility: toggleVisibilityAsync } = c.client;
  const toggleVisibility = useCallback((id: number, current: string) => {
    void toggleVisibilityAsync(id, current);
  }, [toggleVisibilityAsync]);

  const gridAnchorRef = useRef<HTMLDivElement>(null);
  const scrollToAlbum = useCallback(() => {
    gridAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const share = useCallback(() => {
    const url = shareUrl();
    if (typeof navigator.share === 'function') {
      // A dismissed share sheet rejects; there is nothing to report.
      navigator.share({ url }).catch(() => {});
      return;
    }
    void copyText(url).then((copied) => {
      if (copied) toast.success(t('clientGallery.linkCopied', 'Link copied'));
      else toast.error(t('clientGallery.copyFailed', 'Could not copy the link'));
    });
  }, [t]);

  const showBackToTop = useScrolledPastFirstScreen();

  const showFolderTiles = !c.folders.open && c.folders.tiles.length > 0;
  const emptyText = c.url.tab === 'liked'
    ? t('clientGallery.emptyLiked', 'No liked photos yet')
    : c.url.tab === 'picked'
      ? t('clientGallery.emptyPicked', 'No picked photos yet')
      : t('clientGallery.emptyAll', 'No photos yet');

  return (
    <div className="client-gallery">
      <GuestNamePromptModal requireEmail={!!fs?.require_name_email} />
      <GuestRecoveryModal />
      {modals}

      <ExpiryToast slug={c.slug} expiresAt={c.expiry.expiresAt} />

      <CoverHero
        photo={c.heroPhoto}
        slug={c.slug}
        title={c.event.event_name}
        subtitle={c.brandName}
        logoUrl={c.heroLogoUrl}
        anchor={c.data?.event?.hero_image_anchor || 'center'}
        onViewAlbum={scrollToAlbum}
        languagePicker={<LanguageSelector />}
      />

      <div ref={gridAnchorRef} aria-hidden="true" />
      <GalleryToolbar c={c} onShare={share} />

      {c.client.isClient && (
        <p className="cg-client-banner" data-testid="client-banner">
          <ShieldIcon />
          <span>{t('clientAccess.banner', 'Client Mode')}</span>
          <span>{t('clientAccess.visibleCount', '{{visible}} of {{total}} photos visible to guests', { visible: c.client.visibleCount, total: c.client.totalCount })}</span>
        </p>
      )}

      {showFolderTiles && (
        <div className="cg-folders">
          <GalleryFolderTiles
            tiles={c.folders.tiles}
            onOpen={c.folders.openBySlug}
            compact={false}
            slug={c.slug}
            useEnhancedProtection={c.protection.level !== 'basic'}
            allowDownloads={c.allowDownloads}
          />
        </div>
      )}

      {!c.folders.rootIsFoldersOnly && (
        c.visiblePhotos.length === 0 ? (
          <p className="cg-empty">{emptyText}</p>
        ) : c.url.view === 'list' ? (
          <PhotoList
            photos={c.visiblePhotos}
            slug={c.slug}
            onOpen={openFromAlbum}
            onToggle={toggle}
            allowLikes={allowLikes}
            allowPicks={allowPicks}
            showOriginalFilename={c.showOriginalFilename}
            isClient={c.client.isClient}
            onToggleVisibility={toggleVisibility}
          />
        ) : (
          <MasonryGrid
            photos={c.visiblePhotos}
            slug={c.slug}
            onOpen={openFromAlbum}
            onToggle={toggle}
            allowLikes={allowLikes}
            allowPicks={allowPicks}
            selecting={c.selection.active}
            selectedIds={c.selection.ids}
            onSelect={toggleSelected}
            showOriginalFilename={c.showOriginalFilename}
            isClient={c.client.isClient}
            onToggleVisibility={toggleVisibility}
          />
        )
      )}

      {(c.infoMarkdown || c.promoMarkdown) && (
        <div className="cg-notes">
          {c.infoMarkdown && <MarkdownContent source={c.infoMarkdown} className="cg-note" />}
          {c.promoMarkdown && <MarkdownContent source={c.promoMarkdown} className="cg-note" />}
        </div>
      )}

      {showBackToTop && (
        <button
          type="button"
          className="cg-back-to-top"
          aria-label={t('clientGallery.backToTop', 'Back to top')}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUpIcon />
        </button>
      )}

      <PhotoViewer
        photos={viewerPhotos}
        openId={c.url.photo}
        onClose={c.closePhoto}
        onNavigate={stepInViewer}
        c={c}
        onToggle={toggle}
      />

      {/* Download size picker (#858): "download all", or a selection. */}
      {c.resolutionPicker.open && (
        <DownloadResolutionModal
          slug={c.slug}
          choices={c.downloadChoices}
          standardResolution={c.downloadStandard}
          photoIds={c.resolutionPicker.ids || undefined}
          onClose={c.resolutionPicker.close}
        />
      )}

      {/* Out of allowance (#download-quota). Raised by a refused download,
          or opened from the toolbar when the gallery no longer fits. */}
      {c.quotaOffer && (
        <DownloadQuotaDialog
          slug={c.slug}
          exceeded={c.quotaOffer.exceeded}
          packages={c.downloadPackages}
          currency={c.downloadCurrency}
          pendingOrder={c.pendingDownloadOrder}
          onClose={() => c.setQuotaOffer(null)}
        />
      )}

      {/* "Show all" people (#1074): a bottom sheet on mobile. */}
      {c.people.enabled && (
        <PeopleSheet
          open={c.people.sheetOpen}
          onClose={() => c.people.setSheetOpen(false)}
          people={c.people.list}
          photos={c.scopedPhotos}
          slug={c.slug}
          selectedPersonIds={c.people.selectedIds}
          onToggle={c.people.toggle}
        />
      )}
    </div>
  );
}
