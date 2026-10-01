import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { format, parseISO, isValid } from 'date-fns';
import { de, enUS, fr, ptBR, vi } from 'date-fns/locale';
import { CloseIcon, InfoIcon } from '../icons';

interface ExpiryToastProps {
  slug: string;
  expiresAt: string | null;
}

// Same language to locale mapping as hooks/useLocalizedDate, which cannot be
// used here: it reads the public settings through React Query.
function localeFor(language: string) {
  switch (language) {
    case 'de': return de;
    case 'pt':
    case 'pt-BR': return ptBR;
    case 'fr': return fr;
    case 'vi': return vi;
    default: return enUS;
  }
}

const storageKey = (slug: string) => `cg_expiry_dismissed_${slug}`;

function wasDismissed(slug: string): boolean {
  try { return sessionStorage.getItem(storageKey(slug)) === '1'; } catch { return false; }
}

/** A dark pill at the top centre announcing when the album expires. */
export function ExpiryToast({ slug, expiresAt }: ExpiryToastProps) {
  const { t, i18n } = useTranslation();
  const [dismissed, setDismissed] = useState(() => wasDismissed(slug));
  if (!expiresAt || dismissed) return null;
  const parsed = parseISO(expiresAt);
  if (!isValid(parsed)) return null;
  const date = format(parsed, 'dd MMM yyyy', { locale: localeFor(i18n.language) });

  const close = () => {
    try { sessionStorage.setItem(storageKey(slug), '1'); } catch { /* storage blocked: dismiss for this view only */ }
    setDismissed(true);
  };

  return (
    <div className="cg-expiry" role="status">
      <InfoIcon />
      <span>
        <Trans
          i18nKey="clientGallery.expiresOn"
          defaults="Your album expires on <1>{{date}}</1>"
          values={{ date }}
          components={{ 1: <strong /> }}
        />
      </span>
      <button type="button" onClick={close} aria-label={t('common.close', 'Close')}>
        <CloseIcon />
      </button>
    </div>
  );
}
