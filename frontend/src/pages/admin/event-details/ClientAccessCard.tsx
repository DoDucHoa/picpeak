import React, { useState, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Shield, Copy, CheckCircle } from 'lucide-react';
import type { Event } from '../../../types';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../../components/common';
import { eventsService } from '../../../services/events.service';
import { nextEventPassword } from '../../../utils/passwordGenerator';
import type { EditFormState } from './types';
import { StoredPasswordLine } from './settings/StoredPasswordLine';

interface ClientAccessCardProps {
  event: Event;
  refetchEvent: () => void;
  /**
   * 'overview' (default): the client link with Copy and Regenerate, read
   * from saved data. 'settings': the switch and the client password, edited
   * in the page's draft and saved by the bar (spec 5.2).
   */
  mode?: 'overview' | 'settings';
  editForm?: EditFormState;
  setEditForm?: (action: SetStateAction<EditFormState>) => void;
}

export const ClientAccessCard: React.FC<ClientAccessCardProps> = ({
  event, refetchEvent, mode = 'overview', editForm, setEditForm,
}) => {
  const { t } = useTranslation();
  const [copiedClientLink, setCopiedClientLink] = useState(false);

  if (mode === 'settings' && editForm && setEditForm) {
    return <ClientAccessSettings event={event} editForm={editForm} setEditForm={setEditForm} />;
  }

  const link = `${window.location.origin}/gallery/${event.slug}/client-access?token=${event.client_share_token}`;
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5" />
        {t('clientAccess.adminTitle')}
      </h2>
      <div className="space-y-4">
        <p className="text-sm text-body">
          {t('clientAccess.enableToggle')}: {event?.client_access_enabled ? t('common.yes', 'Yes') : t('common.no', 'No')}
        </p>

        {/* !!: SQLite integer boolean; bare 0 renders as literal "0" */}
        {!!event?.client_access_enabled && event?.client_share_token && (
          <div>
            <label className="block text-sm font-medium text-body mb-1">
              {t('clientAccess.linkLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={link}
                readOnly
                className="flex-1 px-3 py-2 bg-inset border border-line-strong text-heading rounded-lg text-sm"
              />
              <Button
                variant="outline"
                size="md"
                leftIcon={copiedClientLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                  } catch {
                    const textArea = document.createElement('textarea');
                    textArea.value = link;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                  }
                  setCopiedClientLink(true);
                  setTimeout(() => setCopiedClientLink(false), 2000);
                }}
              >
                {copiedClientLink ? t('events.copied') : t('events.copy')}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              disabled={event?.is_archived}
              onClick={async () => {
                try {
                  await eventsService.updateEvent(event.id, { regenerate_client_token: true });
                  toast.success(t('clientAccess.tokenRegenerated'));
                  refetchEvent();
                } catch {
                  toast.error(t('common.error'));
                }
              }}
            >
              {t('clientAccess.regenerateToken')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

/**
 * Settings > Access, client half (spec 5.4): the switch and the client
 * password in the page's draft, with the same treatment as the gallery
 * password. Its own component so only this mode reads the password status.
 */
const ClientAccessSettings: React.FC<{
  event: Event;
  editForm: EditFormState;
  setEditForm: (action: SetStateAction<EditFormState>) => void;
}> = ({ event, editForm, setEditForm }) => {
  const { t } = useTranslation();
  const savedOn = !!event.client_access_enabled;
  const hasPassword = event.has_client_password === true;
  const { data: status } = useQuery({
    queryKey: ['admin-event-password-status', event.id],
    queryFn: () => eventsService.getGalleryPasswordStatus(event.id),
    enabled: hasPassword,
  });
  const generate = (current = '') => nextEventPassword(event.event_name, event.event_date || '', current);
  const setPassword = (password: string) => setEditForm((prev) => ({ ...prev, client_password: password }));
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5" />
        {t('clientAccess.adminTitle')}
      </h2>
      <div className="space-y-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
            checked={editForm.client_access_enabled}
            onChange={(e) => {
              const on = e.target.checked;
              // On is the user's own action: start with a generated password
              // when none exists yet. Off forgets a typed one, as the gallery
              // password does: a hidden field must not ride along with a save.
              setEditForm((prev) => ({
                ...prev,
                client_access_enabled: on,
                client_password: on ? (prev.client_password || (savedOn && hasPassword ? '' : generate())) : '',
              }));
            }}
          />
          <div>
            <span className="text-sm font-medium text-body">{t('clientAccess.enableToggle')}</span>
            <p className="text-xs text-muted mt-1">{t('clientAccess.enableDescription')}</p>
          </div>
        </label>

        {editForm.client_access_enabled && (
          <div className="space-y-2">
            {savedOn && !hasPassword && (
              <p className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
                {t('clientAccess.noPasswordSet', 'No client password set. The client cannot open the review page until one is set.')}
              </p>
            )}
            {hasPassword && (
              <StoredPasswordLine eventId={event.id} kind="client" stored={status?.client_password_stored === true} />
            )}
            <label className="block text-sm font-medium text-body mb-1">
              {hasPassword
                ? t('clientAccess.newPasswordKeep', 'New client password (leave empty to keep the current one)')
                : t('clientAccess.passwordLabel')}
            </label>
            <input
              type="text"
              value={editForm.client_password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('clientAccess.passwordPlaceholder')}
              className="w-full px-3 py-2 bg-inset border border-line-strong text-heading rounded-lg text-sm"
            />
            <p className="text-xs text-muted">{t('clientAccess.passwordHelperText')}</p>
            <button
              type="button"
              className="text-sm font-medium text-accent"
              onClick={() => setPassword(generate(editForm.client_password))}
            >
              {t('clientAccess.generate', 'Generate')}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
};
