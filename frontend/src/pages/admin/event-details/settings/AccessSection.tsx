import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Card, Input } from '../../../../components/common';
import { ClientAccessCard } from '../ClientAccessCard';
import { useEventSettings } from './EventSettingsContext';

/** Settings > Access (spec 5.1). The password controls moved from the old edit form unchanged. */
export const AccessSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, refetchEvent } = useEventSettings();
  const [showNewPassword, setShowNewPassword] = useState(false);
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAccess', 'Access')}</h2>
      <div className="space-y-4">
        <div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
              checked={editForm.require_password}
              onChange={(e) => {
                const checked = e.target.checked;
                setEditForm(prev => ({
                  ...prev,
                  require_password: checked,
                  new_password: checked ? prev.new_password : '',
                  confirm_new_password: checked ? prev.confirm_new_password : '',
                }));
                if (!checked) {
                  setShowNewPassword(false);
                }
              }}
            />
            <div>
              <span className="text-sm font-medium text-body">{t('events.requirePasswordToggle')}</span>
              <p className="text-xs text-muted mt-1">
                {t('events.requirePasswordToggleHelp', 'Disable this if you want to share the gallery without a password. Anyone with the link will be able to view the photos.')}
              </p>
            </div>
          </label>

          {!editForm.require_password && (
            <div className="mt-2 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
              {t('events.publicGalleryWarning', 'Public galleries are accessible to anyone with the link. Consider watermarking downloaded files in Branding and monitoring activity.')}
            </div>
          )}
        </div>

        {editForm.require_password && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">
                {t('events.newPasswordLabel', 'New gallery password')}
              </label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={editForm.new_password}
                  onChange={(e) => setEditForm(prev => ({ ...prev, new_password: e.target.value }))}
                  placeholder={t('events.enterPassword')}
                  leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-5 h-5 text-neutral-400 hover:text-body" />
                  ) : (
                    <Eye className="w-5 h-5 text-neutral-400 hover:text-body" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                {t('events.confirmPassword')}
              </label>
              <Input
                type={showNewPassword ? 'text' : 'password'}
                value={editForm.confirm_new_password}
                onChange={(e) => setEditForm(prev => ({ ...prev, confirm_new_password: e.target.value }))}
                placeholder={t('events.confirmPasswordPlaceholder')}
                leftIcon={<Lock className="w-5 h-5 text-neutral-400" />}
              />
            </div>
          </div>
        )}
      </div>
      <div className="mt-6">
        <ClientAccessCard event={event} refetchEvent={refetchEvent} mode="settings" editForm={editForm} setEditForm={setEditForm} />
      </div>
    </Card>
  );
};
