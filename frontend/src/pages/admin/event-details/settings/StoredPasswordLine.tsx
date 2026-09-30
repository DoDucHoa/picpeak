import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { eventsService } from '../../../../services/events.service';

/**
 * Changes whenever the saved event, or either password, changes: a save,
 * a publish or a send with a new password. The line keys its reveal on it.
 */
export function passwordVersion(event: object): string {
  const e = event as { updated_at?: unknown; gallery_password_changed_at?: unknown; client_password_changed_at?: unknown };
  return [e.updated_at, e.gallery_password_changed_at, e.client_password_changed_at].map((v) => String(v ?? '')).join('|');
}

/**
 * The saved password, as far as it can be shown (spec 5.4): a stored copy is
 * revealed on request, and each reveal is logged by the server; without one
 * the line says it is set but not viewable.
 */
export const StoredPasswordLine: React.FC<{
  eventId: number;
  kind: 'gallery' | 'client';
  stored: boolean;
  /** From passwordVersion(event): a new value hides a revealed password. */
  version?: string;
}> = ({ eventId, kind, stored, version }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | null>(null);
  // A revealed password must not outlive the password it showed.
  useEffect(() => { setValue(null); }, [version, stored]);
  const reveal = async () => {
    try {
      const res = await eventsService.getGalleryPassword(eventId);
      setValue((kind === 'gallery' ? res.password : res.client_password) ?? null);
    } catch {
      toast.error(t('events.failedToLoadPassword', 'Failed to load the stored password'));
    }
  };
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(t('events.access.copied', 'Copied'));
  };
  return (
    <div className="text-sm">
      <span className="font-medium text-body">{t('events.access.currentPassword', 'Current password')}: </span>
      {!stored && (
        <span className="text-muted" title={t('events.access.notViewableHelp', 'Only a hash is stored for this password. Set a new one to see it here later.')}>
          {t('events.access.notViewable', 'Set, not viewable')}
        </span>
      )}
      {stored && value === null && (
        <button type="button" className="text-accent font-medium" onClick={reveal}>{t('events.access.show', 'Show')}</button>
      )}
      {stored && value !== null && (
        <span className="inline-flex items-center gap-2">
          <code className="font-mono text-heading">{value}</code>
          <button type="button" className="text-accent" onClick={() => copy(value)}>{t('events.access.copy', 'Copy')}</button>
          <button type="button" className="text-accent" onClick={() => setValue(null)}>{t('events.access.hide', 'Hide')}</button>
        </span>
      )}
    </div>
  );
};
