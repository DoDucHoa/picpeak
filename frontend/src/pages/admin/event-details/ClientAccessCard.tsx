import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Shield, Key, Copy, CheckCircle } from 'lucide-react';
import type { Event } from '../../../types';
import { Button, Card, PasswordGenerator } from '../../../components/common';
import { eventsService } from '../../../services/events.service';

interface ClientAccessCardProps {
  event: Event;
  refetchEvent: () => void;
}

/**
 * The same floor the gallery password has, and the same one the backend now
 * enforces. Client access is a second way into the gallery, not a convenience
 * code, so a two-character secret should not be settable here while the guest
 * password refuses one.
 */
function clientPasswordProblem(value: string): 'min' | 'simple' | null {
  if (value.length < 6) return 'min';
  if (/^\d+$/.test(value)) return 'simple';
  return null;
}

export const ClientAccessCard: React.FC<ClientAccessCardProps> = ({ event, refetchEvent }) => {
  const { t } = useTranslation();
  const [copiedClientLink, setCopiedClientLink] = useState(false);
  const [clientPassword, setClientPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const applyPassword = async () => {
    const candidate = clientPassword.trim();
    if (!candidate) return;

    const problem = clientPasswordProblem(candidate);
    if (problem) {
      setPasswordError(
        problem === 'min'
          ? t('validation.passwordMinLength')
          : t(
            'validation.passwordTooSimple',
            'Password cannot be just numbers. Consider using a date format like "04.07.2025"',
          ),
      );
      return;
    }

    try {
      await eventsService.updateEvent(event.id, { client_password: candidate });
      setClientPassword('');
      setPasswordError(null);
      toast.success(t('clientAccess.passwordUpdated'));
      refetchEvent();
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5" />
        {t('clientAccess.adminTitle')}
      </h2>

      <div className="space-y-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 text-accent border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500"
            checked={!!event?.client_access_enabled}
            onChange={async (e) => {
              try {
                await eventsService.updateEvent(event.id, { client_access_enabled: e.target.checked });
                refetchEvent();
              } catch {
                toast.error(t('common.error'));
              }
            }}
            disabled={event?.is_archived}
          />
          <div>
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('clientAccess.enableToggle')}
            </span>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {t('clientAccess.enableDescription')}
            </p>
          </div>
        </label>

        {/* !! — SQLite integer boolean; bare 0 renders as literal "0" */}
        {!!event?.client_access_enabled && (
          <>
            {/* Set or change the client password */}
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('clientAccess.passwordLabel')}
                  </label>
                  <input
                    type="text"
                    value={clientPassword}
                    onChange={(e) => {
                      setClientPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder={t('clientAccess.passwordPlaceholder')}
                    aria-invalid={passwordError ? true : undefined}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 rounded-lg text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="md"
                  leftIcon={<Key className="w-4 h-4" />}
                  onClick={applyPassword}
                  disabled={!clientPassword.trim()}
                >
                  {t('clientAccess.setPassword')}
                </Button>
              </div>

              {passwordError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordError}</p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('clientAccess.passwordHelperText')}
                </p>
              )}

              {/* Same generator the gallery password gets, seeded from this
                  event so the suggestion is something the photographer can
                  read out to the client. */}
              <div className="mt-2">
                <PasswordGenerator
                  eventName={event.event_name}
                  eventDate={event.event_date || ''}
                  eventType={event.event_type}
                  onPasswordGenerated={(password) => {
                    setClientPassword(password);
                    setPasswordError(null);
                  }}
                  passwordComplexity="moderate"
                  className="w-full"
                />
              </div>
            </div>

            {/* Client access link */}
            {event?.client_share_token && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('clientAccess.linkLabel')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={`${window.location.origin}/gallery/${event.slug}/client-access?token=${event.client_share_token}`}
                    readOnly
                    className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 rounded-lg text-sm"
                  />
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={copiedClientLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    onClick={async () => {
                      const link = `${window.location.origin}/gallery/${event.slug}/client-access?token=${event.client_share_token}`;
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
          </>
        )}
      </div>
    </Card>
  );
};
