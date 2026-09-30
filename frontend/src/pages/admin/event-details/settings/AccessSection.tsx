import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, Input, useConfirm } from '../../../../components/common';
import { eventsService } from '../../../../services/events.service';
import { normalizeRequirePassword } from '../../../../utils/accessControl';
import { nextEventPassword } from '../../../../utils/passwordGenerator';
import { ClientAccessCard } from '../ClientAccessCard';
import { StoredPasswordLine } from './StoredPasswordLine';
import { useEventSettings } from './EventSettingsContext';

/**
 * Settings > Access (spec 5.4). The password is shown the way it is stored,
 * regenerated or typed in clear, with no confirm field. Removing it from a
 * published gallery asks first, at the toggle.
 */
export const AccessSection: React.FC = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { event, editForm, setEditForm, refetchEvent } = useEventSettings();
  const savedOn = normalizeRequirePassword(event.require_password);
  const published = !event.is_draft;
  const { data: status } = useQuery({
    queryKey: ['admin-event-password-status', event.id],
    queryFn: () => eventsService.getGalleryPasswordStatus(event.id),
    enabled: savedOn,
  });
  const generate = (current = '') => nextEventPassword(event.event_name, event.event_date || '', current);

  const onToggle = async (checked: boolean) => {
    if (!checked && savedOn && published) {
      const ok = await confirm({
        title: t('events.access.turnOffTitle', 'Remove the password?'),
        message: t('events.access.turnOffMessage', 'This gallery is published. Without a password, anyone with the link can see the photos.'),
        confirmLabel: t('events.access.turnOffConfirm', 'Remove password'),
        variant: 'danger',
      });
      if (!ok) return;
    }
    setEditForm(prev => ({
      ...prev,
      require_password: checked,
      // Switching protection on is the user's own action: start with a
      // generated password. Off forgets a typed one.
      new_password: checked ? (prev.new_password || (savedOn ? '' : generate())) : '',
    }));
  };

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAccess', 'Access')}</h2>
      <div className="space-y-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
            checked={editForm.require_password}
            onChange={(e) => { void onToggle(e.target.checked); }}
          />
          <span>
            <span className="text-sm font-medium text-body">{t('events.requirePasswordToggle')}</span>
            <span className="block text-xs text-muted mt-1">
              {t('events.requirePasswordToggleHelp', 'Disable this if you want to share the gallery without a password. Anyone with the link will be able to view the photos.')}
            </span>
          </span>
        </label>

        {!editForm.require_password && (
          <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
            {t('events.publicGalleryWarning', 'Public galleries are accessible to anyone with the link. Consider watermarking downloaded files in Branding and monitoring activity.')}
          </div>
        )}

        {editForm.require_password && (
          <div className="space-y-2">
            {savedOn && <StoredPasswordLine eventId={event.id} kind="gallery" stored={status?.password_stored === true} />}
            <Input
              type="text"
              label={savedOn
                ? t('events.access.newPasswordKeep', 'New password (leave empty to keep the current one)')
                : t('events.access.galleryPassword', 'Gallery password')}
              value={editForm.new_password}
              onChange={(e) => setEditForm(prev => ({ ...prev, new_password: e.target.value }))}
              placeholder={t('events.enterPassword')}
            />
            <button
              type="button"
              className="text-sm font-medium text-accent"
              onClick={() => setEditForm(prev => ({ ...prev, new_password: generate(prev.new_password) }))}
            >
              {t('events.access.regenerate', 'Regenerate')}
            </button>
          </div>
        )}
      </div>
      <div className="mt-6">
        <ClientAccessCard event={event} refetchEvent={refetchEvent} mode="settings" editForm={editForm} setEditForm={setEditForm} />
      </div>
    </Card>
  );
};
