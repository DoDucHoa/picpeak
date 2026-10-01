import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Lightbox, { isImageSlide, stopNavigationEventsPropagation } from 'yet-another-react-lightbox';
import type { GenericSlide, RenderSlideProps, Slide, SlideImage } from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';

import { AuthenticatedImage } from '../../../components/common';
import { lightboxImageUrl } from '../../../components/gallery/imageTiers';
import { VideoPlayer } from '../../../components/gallery/VideoPlayer';
import { PhotoComments } from '../../../components/gallery/PhotoComments';
import { resolveMediaType } from '../../../components/gallery/hooks/useGalleryFiltering';
import { feedbackService } from '../../../services/feedback.service';
import { useInputMode } from '../../../hooks/useInputMode';
import type { Photo } from '../../../types';
import type { GalleryController } from '../state/useGalleryController';
import { useViewportWidth } from '../layout/useViewportWidth';
import { CloseIcon } from '../icons';
import { ViewerRail } from './ViewerRail';
import type { ViewerPanel } from './ViewerRail';
import { Filmstrip } from './Filmstrip';
import { FileInfoPanel } from './FileInfoPanel';

/** A video in the carousel. Rendered by our own slide branch, never by YARL. */
interface ViewerVideoSlide extends GenericSlide {
  type: 'video';
  src: string;
  poster?: string;
}

declare module 'yet-another-react-lightbox' {
  interface SlideTypes {
    video: ViewerVideoSlide;
  }
}

interface PhotoViewerProps {
  photos: Photo[];
  openId: number | null;
  onClose: () => void;
  onNavigate: (id: number) => void;
  c: GalleryController;
  onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
}

type ImageLoad = (src: string, dimensions: { width: number; height: number }) => void;

/** Return undefined for YARL's ordinary image renderer, including all neighbours.
 * Keeping the slide's image type lets its Zoom plugin own gestures and transforms. */
function renderViewerCanvasImage({
  slide, offset, slug, useCanvasRendering, onImageLoad,
}: RenderSlideProps & { slug: string; useCanvasRendering: boolean; onImageLoad: ImageLoad }) {
  if (!isImageSlide(slide) || offset !== 0 || !useCanvasRendering) {
    return undefined;
  }

  return <ViewerCanvasImage key={slide.src} slide={slide} slug={slug} onImageLoad={onImageLoad} />;
}

function ViewerCanvasImage({ slide, slug, onImageLoad }: {
  slide: SlideImage;
  slug: string;
  onImageLoad: ImageLoad;
}) {
  // Stable across zoom/parent renders: AuthenticatedImage's decode effect
  // depends on this callback, so an inline function would decode again.
  const handleLoad = useCallback((dimensions: { width: number; height: number }) => {
    onImageLoad(slide.src, dimensions);
  }, [slide.src, onImageLoad]);

  return (
    <AuthenticatedImage
      data-testid="viewer-canvas-image"
      src={slide.src}
      fallbackSrc={slide.thumbnail}
      alt={slide.alt || ''}
      slug={slug}
      isGallery
      queuePriority="high"
      useCanvasRendering
      className="yarl__slide_image"
      onLoad={handleLoad}
      draggable={false}
    />
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * The full-screen photo viewer. The URL owns which photo is open: every step
 * (arrow keys, swipe, the filmstrip) goes out through onNavigate and comes
 * back as openId, and every way out goes through onClose.
 */
export function PhotoViewer({ photos, openId, onClose, onNavigate, c, onToggle }: PhotoViewerProps) {
  const { t } = useTranslation();
  const narrow = useViewportWidth() < 768;
  const touch = useInputMode() === 'touch';
  const [panel, setPanel] = useState<ViewerPanel | null>(null);

  const index = openId === null ? -1 : photos.findIndex((p) => p.id === openId);
  const photo = index >= 0 ? photos[index] : null;
  const open = photo !== null;

  // The delivered preview can be smaller than the original. Keep Zoom's
  // pixel limit and aspect ratio tied to the loaded rendition, as its default
  // image renderer does internally.
  const [loaded, setLoaded] = useState<Record<string, { width: number; height: number }>>({});
  const handleImageLoad = useCallback<ImageLoad>((src, dimensions) => {
    setLoaded((previous) => (
      previous[src]?.width === dimensions.width && previous[src]?.height === dimensions.height
        ? previous
        : { ...previous, [src]: dimensions }
    ));
  }, []);

  const slides = useMemo<Slide[]>(() => photos.map((p) => {
    if (resolveMediaType(p) === 'video') {
      return { type: 'video', src: p.url, poster: p.thumbnail_url || undefined };
    }
    const src = lightboxImageUrl(p);
    return {
      src,
      width: loaded[src]?.width || p.width || 1200,
      height: loaded[src]?.height || p.height || 800,
      thumbnail: p.thumbnail_url || undefined,
      alt: '',
    };
  }), [photos, loaded]);

  // Read through refs by the window listener and YARL's view callback, so
  // neither has to be re-registered on every step.
  const latest = useRef({ photos, index, onNavigate, onClose, panel });
  latest.current = { photos, index, onNavigate, onClose, panel };

  // The arrow keys and Escape are handled here rather than by YARL: its own
  // listener sits on its container and only hears keys while that has focus,
  // and its steps would run from its internal index instead of the URL's.
  // Capture phase, so YARL never sees the same key a second time.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const { photos: list, index: at, onNavigate: go, onClose: close, panel: openPanel } = latest.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // One layer at a time: an open side panel goes first, the viewer next.
        if (openPanel) setPanel(null);
        else close();
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (list.length < 2 || at < 0) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      go(list[(at + step + list.length) % list.length].id);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const onView = useCallback(({ index: viewed }: { index: number }) => {
    const { photos: list, index: at, onNavigate: go } = latest.current;
    // YARL also reports the slide it was told to show; only a step it took
    // itself (a swipe) is news.
    if (viewed === at || !list[viewed]) return;
    go(list[viewed].id);
  }, []);

  const slidePadding = narrow
    ? '64px 8px 72px 8px'
    : `24px ${panel ? 24 + 360 : 24}px 96px 96px`;

  if (!photo) return null;

  return (
    <Lightbox
      open
      index={index}
      slides={slides}
      close={onClose}
      className={`client-gallery cg-viewer${panel ? ' cg-viewer-with-panel' : ''}`}
      carousel={{ finite: false, preload: 1 }}
      animation={{ fade: 150, swipe: 250 }}
      controller={{ closeOnBackdropClick: false }}
      plugins={[Zoom]}
      styles={{ container: { backgroundColor: '#ffffff' }, slide: { padding: slidePadding } }}
      on={{ view: onView }}
      toolbar={{ buttons: [] }}
      render={{
        slide: (props) => {
          if (props.slide.type === 'video') {
            return props.offset === 0
              ? <VideoPlayer src={props.slide.src} poster={props.slide.poster} className="cg-viewer-video" controls autoPlay={false} />
              : null;
          }
          return renderViewerCanvasImage({
            ...props, slug: c.slug, useCanvasRendering: c.protection.canvas, onImageLoad: handleImageLoad,
          });
        },
        controls: () => (
          <>
            <ViewerRail photo={photo} c={c} panel={panel} onPanel={setPanel} onBack={onClose} onToggle={onToggle} />
            {panel && (
              <aside
                className="cg-viewer-panel"
                aria-label={panel === 'comments' ? t('clientGallery.viewer.comments', 'Comments') : t('clientGallery.viewer.fileInfo', 'File info')}
                {...stopNavigationEventsPropagation()}
              >
                <div className="cg-viewer-panel-head">
                  <h2>{panel === 'comments' ? t('clientGallery.viewer.comments', 'Comments') : t('clientGallery.viewer.fileInfo', 'File info')}</h2>
                  <button type="button" className="cg-viewer-btn" aria-label={t('clientGallery.cancel', 'Cancel')} onClick={() => setPanel(null)}>
                    <CloseIcon />
                  </button>
                </div>
                {panel === 'comments'
                  ? <CommentsPanel key={photo.id} photo={photo} c={c} />
                  : <FileInfoPanel photo={photo} showOriginalFilename={c.showOriginalFilename} />}
              </aside>
            )}
            <Filmstrip photos={photos} openId={openId} slug={c.slug} canvas={c.protection.canvas} showOriginalFilename={c.showOriginalFilename} onNavigate={onNavigate} />
          </>
        ),
        buttonPrev: touch || photos.length <= 1 ? () => null : undefined,
        buttonNext: touch || photos.length <= 1 ? () => null : undefined,
        slideFooter: undefined,
      }}
    />
  );
}

/** The current photo's comments, fetched under the key PhotoComments refreshes after a post. */
function CommentsPanel({ photo, c }: { photo: Photo; c: GalleryController }) {
  const photoId = String(photo.id);
  const { data } = useQuery({
    queryKey: ['photo-feedback', c.slug, photoId],
    queryFn: () => feedbackService.getPhotoFeedback(c.slug, photoId),
  });
  const comments = useMemo(() => (data?.feedback || []).filter((f) => f.feedback_type === 'comment'), [data]);

  return (
    <PhotoComments
      photoId={photoId}
      gallerySlug={c.slug}
      comments={comments}
      isEnabled
      requireNameEmail={Boolean(c.feedbackSettings?.require_name_email)}
      showToGuests={Boolean(c.feedbackSettings?.show_feedback_to_guests)}
    />
  );
}
