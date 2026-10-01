import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Image } from 'lucide-react';
import type { Event } from '../../../types';
import type { FeedbackSettings as FeedbackSettingsType } from '../../../services/feedback.service';
import type { EventDetailsTab } from './types';
import { eventHasGuests } from './utils';

interface EventTabsProps {
  event: Event;
  eventFeedbackSettings: FeedbackSettingsType | undefined;
  activeTab: EventDetailsTab;
  setActiveTab: (tab: EventDetailsTab) => void;
}

export const EventTabs: React.FC<EventTabsProps> = ({
  event,
  eventFeedbackSettings,
  activeTab,
  setActiveTab
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-6 border-b border-line overflow-x-auto">
      {/* Scrolls sideways below sm rather than wrapping (spec 5.1). */}
      <nav className="-mb-px flex space-x-8 whitespace-nowrap">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-1 border-b-2 font-medium text-sm ${
            activeTab === 'overview'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-body hover:border-line-strong'
          }`}
        >
          {t('events.overview')}
        </button>
        <button
          onClick={() => setActiveTab('photos')}
          className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
            activeTab === 'photos'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-body hover:border-line-strong'
          }`}
        >
          <Image className="w-4 h-4" />
          <span>{(event.video_count ?? 0) > 0 ? t('events.media', 'Media') : t('events.photos')}</span>
          {event.photo_count !== undefined && event.photo_count > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-inset text-body rounded-full">
              {event.photo_count}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`py-2 px-1 border-b-2 font-medium text-sm ${
            activeTab === 'categories'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-body hover:border-line-strong'
          }`}
        >
          {t('events.categories')}
        </button>
        <button
          onClick={() => setActiveTab('downloads')}
          className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
            activeTab === 'downloads'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-body hover:border-line-strong'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>{t('downloadQuotaAdmin.ledger.tab', 'Downloads')}</span>
        </button>
        {eventHasGuests(event, eventFeedbackSettings) && (
          <button
            onClick={() => setActiveTab('guests')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'guests'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-body hover:border-line-strong'
            }`}
          >
            {t('admin.events.tabs.guests', 'Guests')}
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`py-2 px-1 border-b-2 font-medium text-sm ${
            activeTab === 'settings'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-body hover:border-line-strong'
          }`}
        >
          {t('events.settings.tab', 'Settings')}
        </button>
      </nav>
    </div>
  );
};
