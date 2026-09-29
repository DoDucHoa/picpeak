import React from 'react';
import type { Event } from '../../../types';
import { FeedbackModerationPanel } from '../../../components/admin';
import { PermissionGate } from '../../../components/admin/PermissionGate';
import { DownloadQuotaCard } from '../../../components/admin/DownloadQuotaCard';
import { ShortUrlsCard } from '../../../components/admin/ShortUrlsCard';
import type { FeedbackSettings as FeedbackSettingsType } from '../../../services/feedback.service';
import type { EventDetailsTab } from './types';
import { EventInformationCard } from './EventInformationCard';
import { ShareLinkCard } from './ShareLinkCard';
import { ClientAccessCard } from './ClientAccessCard';
import { EventActionsCard } from './EventActionsCard';
import { PhotoStatisticsCard } from './PhotoStatisticsCard';
import { ArchiveStatusCard } from './ArchiveStatusCard';
import { toBoolean } from '../../../utils/parsers';

interface OverviewTabProps {
  event: Event;
  id: string | undefined;
  passwordVersion?: number;
  /** The SAVED feedback settings: the Overview reads saved data only (spec 5.1). */
  feedbackSettings: FeedbackSettingsType | undefined;
  categories: Array<{ id: number; name: string; slug: string; is_folder?: boolean }>;
  phoneFieldEnabled: boolean;
  daysUntilExpiration: number | null;
  onRevealNow?: () => void;
  refetchEvent: () => void;
  setActiveTab: (tab: EventDetailsTab) => void;
  /** Opens the Settings tab at a section (the Overview holds no settings). */
  openSettings: (section: string) => void;
  setShowPublishDialog: (show: boolean) => void;
  onSendGalleryEmail: () => void;
  isSendingGalleryEmail: boolean;
  setShowDuplicateDialog: (show: boolean) => void;
  onArchive: () => void;
  isArchiving: boolean;
  isPublishing: boolean;
  isDuplicating: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  event,
  id,
  passwordVersion,
  feedbackSettings,
  categories,
  phoneFieldEnabled,
  daysUntilExpiration,
  onRevealNow,
  refetchEvent,
  setActiveTab,
  openSettings,
  setShowPublishDialog,
  onSendGalleryEmail,
  isSendingGalleryEmail,
  setShowDuplicateDialog,
  onArchive,
  isArchiving,
  isPublishing,
  isDuplicating,
}) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left Column - Main Details */}
      <div className="space-y-6">
        {/* Event Information */}
        <EventInformationCard
          event={event}
          categories={categories}
          phoneFieldEnabled={phoneFieldEnabled}
          daysUntilExpiration={daysUntilExpiration}
          onRevealNow={onRevealNow}
        />

        {/* Share Link */}
        <ShareLinkCard event={event} onChangePassword={() => openSettings('access')} passwordVersion={passwordVersion} />

        {/* Branded short URLs (#699). Sits between the canonical share-link
            card and the Client Access card — same "things you share with
            the customer" cluster. */}
        <ShortUrlsCard eventId={event.id} />

        {/* Client Access (#172) */}
        <ClientAccessCard event={event} refetchEvent={refetchEvent} />

        {/* Download allowance (migration 214). Always mounted: the card owns
            its own on-off switch, and the ledger it reports on survives the
            feature being switched off, so hiding it would hide history. */}
        <PermissionGate permissions={['events.view', 'events.edit']}>
          <DownloadQuotaCard eventId={event.id} part="status" downloadsDisabled={!event.allow_downloads} />
        </PermissionGate>

        {/* Actions */}
        {!event.is_archived && (
          <PermissionGate permissions={['events.edit', 'events.archive', 'events.create']}>
            <EventActionsCard
              event={event}
              onArchive={onArchive}
              isArchiving={isArchiving}
              setShowPublishDialog={setShowPublishDialog}
              isPublishing={isPublishing}
              setShowDuplicateDialog={setShowDuplicateDialog}
              isDuplicating={isDuplicating}
              onSendGalleryEmail={onSendGalleryEmail}
              isSendingGalleryEmail={isSendingGalleryEmail}
              assignedCustomerCount={
                ((event as {
                  customer_accounts?: Array<{
                    id: number; email?: string; is_active?: unknown; can_sign_in?: unknown
                  }>
                }).customer_accounts || [])
                  // Only accounts the endpoint would actually mail count, or
                  // the button appears and then 400s. Mirrors
                  // canReceiveGalleryNotice in crud.js: active, holding an
                  // address, and able to sign in — a PASSIVE customer
                  // (never invited, so no password) would get a portal link
                  // to a door that will not open. toBoolean rather than
                  // `!== false` because SQLite returns 0/1.
                  .filter((c) => toBoolean(c.is_active, true)
                    && toBoolean(c.can_sign_in, true)
                    && !!c.email).length
              }
            />
          </PermissionGate>
        )}
      </div>

      {/* Right Column - Statistics, Theme, and Actions */}
      <div className="space-y-6">
        {/* Photo Statistics */}
        <PhotoStatisticsCard event={event} categories={categories} setActiveTab={setActiveTab} />

        {/* Feedback Moderation Panel */}
        {!event.is_archived && feedbackSettings?.feedback_enabled && (
          <FeedbackModerationPanel
            eventId={parseInt(id!)}
            compact={true}
            maxItems={3}
          />
        )}

        {/* Archive Status */}
        {event.is_archived ? (
          <ArchiveStatusCard event={event} id={id} />
        ) : null}
      </div>
    </div>
  );
};
