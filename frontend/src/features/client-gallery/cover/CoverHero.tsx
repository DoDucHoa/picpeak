import React from 'react';
import { useTranslation } from 'react-i18next';
import { AuthenticatedImage } from '../../../components/common';
import type { Photo } from '../../../types';

interface CoverHeroProps {
  photo: Photo | null;
  slug: string;
  title: string;
  subtitle: string;
  logoUrl: string | null;
  anchor: string;
  onViewAlbum: () => void;
  languagePicker: React.ReactNode;
}

// The values the backend stores for hero_image_anchor (eventSettings validator):
// top, center, bottom, or a focal point "X% Y%" with both numbers 0 to 100.
function objectPositionFor(anchor: string): string {
  if (['top', 'center', 'bottom'].includes(anchor)) return anchor;
  const match = /^(\d{1,3})%\s+(\d{1,3})%$/.exec(anchor);
  if (match && Number(match[1]) <= 100 && Number(match[2]) <= 100) return anchor;
  return 'center';
}

/** The full-screen cover: photo, title and photographer bottom left, "View Album" bottom right. */
export function CoverHero({ photo, slug, title, subtitle, logoUrl, anchor, onViewAlbum, languagePicker }: CoverHeroProps) {
  const { t } = useTranslation();
  const src = photo ? photo.hero_url || photo.slideshow_url || photo.url : '';
  return (
    <section className="cg-cover">
      {photo && src && (
        <AuthenticatedImage
          src={src}
          alt=""
          slug={slug}
          isGallery
          queuePriority="high"
          className="cg-cover-img"
          style={{ objectPosition: objectPositionFor(anchor) }}
        />
      )}
      <div className="cg-cover-shade" />
      {logoUrl && <img src={logoUrl} alt="" className="cg-cover-logo" />}
      {languagePicker && <div className="cg-cover-lang">{languagePicker}</div>}
      <div className="cg-cover-text">
        <h1 className="cg-title">{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button type="button" className="cg-cover-button" onClick={onViewAlbum}>
        {t('clientGallery.viewAlbum', 'View Album')}
      </button>
    </section>
  );
}
