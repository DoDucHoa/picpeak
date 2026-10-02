import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { format, parseISO, isValid } from 'date-fns';
import { getDateFnsLocale } from '../../../utils/dateLocale';
import { CloseIcon, InfoIcon } from '../icons';

interface ExpiryToastProps {
  slug: string;
  expiresAt: string | null;
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
  const date = format(parsed, 'dd MMM yyyy', { locale: getDateFnsLocale(i18n.language) });

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
