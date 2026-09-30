import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Image,
  Shield,
  Layout
} from 'lucide-react';
import type { Event } from '../../../types';
import { Card } from '../../../components/common';
import { useLocalizedDate } from '../../../hooks/useLocalizedDate';
import { safeParseDate } from './utils';

/**
 * The event summary on the Overview: saved data only (spec 5.1). Every
 * setting it used to edit lives in the Settings tab.
 */
interface EventInformationCardProps {
  event: Event;
  phoneFieldEnabled: boolean;
  daysUntilExpiration: number | null;
}

export const EventInformationCard: React.FC<EventInformationCardProps> = ({
  event,
  phoneFieldEnabled,
  daysUntilExpiration,
}) => {
  const { t } = useTranslation();
  
  const { format } = useLocalizedDate();

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.eventInformation')}</h2>

      <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted">{t('events.sourceMode', 'Source Mode')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.source_mode === 'reference' ? t('events.sourceModeReference', 'Reference external folder') : t('events.sourceModeManaged', 'Managed (upload to PicPeak)')}
              {event.source_mode === 'reference' && event.external_path ? (
                <span className="text-muted ml-2">/external-media/{event.external_path}</span>
              ) : null}
              {event.source_mode === 'reference' && event.external_watch ? (
                <span className="block text-xs text-muted mt-1">
                  {t('events.externalWatchActive', 'Folder is watched — new files are imported automatically.')}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted">{t('events.welcomeMessage')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.welcome_message || <span className="text-neutral-400">{t('events.noWelcomeMessageSet')}</span>}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted">{t('events.hostName')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.customer_name || <span className="text-neutral-400">{t('common.notSet')}</span>}
            </dd>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted">{t('events.hostEmail')}</dt>
            <dd className="mt-1 text-sm text-heading">{event.customer_email}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted">{t('events.adminEmail')}</dt>
              <dd className="mt-1 text-sm text-heading">{event.admin_email}</dd>
            </div>
          </div>

          {phoneFieldEnabled && (
            <div>
              <dt className="text-sm font-medium text-muted">
                {t('events.customerPhone', 'Customer Phone')}
              </dt>
              <dd className="mt-1 text-sm text-heading">
                {event.customer_phone || (
                  <span className="text-neutral-400">{t('common.notSet')}</span>
                )}
              </dd>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted">{t('events.created')}</dt>
              <dd className="mt-1 text-sm text-heading">
                {event.created_at && format(safeParseDate(event.created_at)!, 'PP')}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted">{t('events.expires')}</dt>
              <dd className="mt-1 text-sm text-heading">
                {event.expires_at ? (
                  <>
                    {format(safeParseDate(event.expires_at)!, 'PP')}
                    {!event.is_archived && daysUntilExpiration !== null && daysUntilExpiration > 0 && (
                      <span className="text-muted ml-1">
                        {t('events.daysLeft', { count: daysUntilExpiration })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">{t('events.neverExpires', 'Never')}</span>
                )}
              </dd>
            </div>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted">{t('events.heroPhoto')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.hero_photo_id ? (
                <span className="text-accent">{t('events.heroPhotoSelected')}</span>
              ) : (
                <span className="text-neutral-400">{t('events.noHeroPhotoSelected')}</span>
              )}
            </dd>
          </div>

          {/* Guest uploads, uploader names and reveal mode were removed in P3;
              the credit switch stays (spec 5.12). */}
          <div>
            <dt className="text-sm font-medium text-muted">{t('events.credits.showToGuests', 'Show photo credits to guests')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.show_credits_to_guests
                ? t('events.uploaderNames.shownToGuests')
                : t('events.uploaderNames.hiddenFromGuests')}
            </dd>
          </div>

          {/* Download Protection Display */}
          <div className="pt-3 mt-3 border-t border-line">
            <dt className="text-sm font-medium text-muted flex items-center gap-2">
              <Shield className="w-4 h-4" />
              {t('events.downloadProtection', 'Download Protection')}
            </dt>
            <dd className="mt-2 text-sm text-heading">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
                  event.protection_level === 'maximum' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                  event.protection_level === 'enhanced' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' :
                  event.protection_level === 'standard' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                  'bg-inset text-body'
                }`}>
                  {event.protection_level || 'standard'}
                </span>
                {!event.allow_downloads && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded">
                    <Download className="w-3 h-3 mr-1" />
                    {t('events.downloadsDisabled', 'Downloads disabled')}
                  </span>
                )}
              </div>
            </dd>
          </div>

          {/* Hero Logo Settings Display */}
          <div className="pt-3 mt-3 border-t border-line">
            <dt className="text-sm font-medium text-muted flex items-center gap-2">
              <Layout className="w-4 h-4" />
              {t('events.heroLogoSettings', 'Hero Logo Settings')}
            </dt>
            <dd className="mt-2 text-sm text-heading">
              <div className="flex flex-wrap gap-2">
                {event.hero_logo_visible !== false ? (
                  <>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">
                      <Image className="w-3 h-3 mr-1" />
                      {t('events.heroLogoVisibleLabel', 'Logo visible')}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-inset text-body rounded">
                      {t('events.heroLogoSizeLabel', 'Size')}: {event.hero_logo_size || 'medium'}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-inset text-body rounded">
                      {t('events.heroLogoPositionLabel', 'Position')}: {event.hero_logo_position || 'top'}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-inset text-body rounded">
                    <Image className="w-3 h-3 mr-1" />
                    {t('events.heroLogoHidden', 'Logo hidden')}
                  </span>
                )}
              </div>
            </dd>
          </div>
      </dl>
    </Card>
  );
};
