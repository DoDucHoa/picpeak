import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useExpiryRefresh } from '../../hooks/useExpiryRefresh';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { Button, Card, Loading } from '../../components/common';
import { PasswordResetModal, PublishGalleryDialog, SendGalleryEmailDialog, DuplicateEventDialog, EventRenameDialog, AdminGuestsList } from '../../components/admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsService } from '../../services/events.service';
import { usePublicSettings } from '../../hooks/usePublicSettings';
import { isGalleryPublic } from '../../utils/accessControl';
import { photosService, AdminPhoto, type PhotoFilters as PhotoFilterParams, type FeedbackFilters } from '../../services/photos.service';
import { feedbackService, FeedbackSettings as FeedbackSettingsType } from '../../services/feedback.service';
import { cssTemplatesService } from '../../services/cssTemplates.service';
import { ThemeConfig, GALLERY_THEME_PRESETS } from '../../types/theme.types';
import { safeParseDate, eventHasGuests } from './event-details/utils';
import { INITIAL_EDIT_FORM, type EventDetailsTab, type ThemeDraft } from './event-details/types';
import { eventFormValues, themeValue } from './event-details/draft/serverValues';
import { useDraftObject, useEventDraft } from './event-details/draft/useEventDraft';
import { buildEventPayload, runSave, validateDraft } from './event-details/draft/saveDraft';
import { changesFor, isChangedElsewhere, type DraftPart } from './event-details/draft/eventDraft';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import { usePermissions } from '../../contexts/PermissionsContext';
import { api } from '../../config/api';
import { EventSettingsContext } from './event-details/settings/EventSettingsContext';
import { EventSettingsTab, useSectionLabel } from './event-details/settings/EventSettingsTab';
import { sectionOf, type SectionId } from './event-details/settings/sectionFields';
import { useExpertMode } from './event-details/settings/AdvancedArea';
import { EventSaveBar } from './event-details/EventSaveBar';
import { EventDetailsHeader } from './event-details/EventDetailsHeader';
import { EventTabs } from './event-details/EventTabs';
import { OverviewTab } from './event-details/OverviewTab';
import { PhotosTab } from './event-details/PhotosTab';
import { CategoriesTab } from './event-details/CategoriesTab';
import { DownloadLedgerTab } from '../../components/admin/DownloadLedgerTab';

const ALL_TAB_KEYS: EventDetailsTab[] = ['overview', 'photos', 'categories', 'guests', 'downloads', 'settings'];

function isValidTab(value: string | null): value is EventDetailsTab {
  return value !== null && (ALL_TAB_KEYS as string[]).includes(value);
}

export const EventDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Validate ID parameter
  React.useEffect(() => {
    if (!id || isNaN(parseInt(id))) {
      navigate('/admin/events');
    }
  }, [id, navigate]);

  // Read ?tab=… on mount, same shape as SettingsPage so both surfaces answer
  // deep links identically; an unknown value falls back to the default tab and
  // the sync effect below rewrites the URL to match (QA follow-up).
  const [activeTab, setActiveTab] = useState<EventDetailsTab>(
    isValidTab(searchParams.get('tab')) ? (searchParams.get('tab') as EventDetailsTab) : 'overview'
  );

  // Keep the URL in sync when the user clicks tabs, so copy-pasting the address
  // lands the recipient on the same tab.
  useEffect(() => {
    if (searchParams.get('tab') === activeTab) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', activeTab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reflect external URL changes (back/forward) back into local state.
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (isValidTab(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showSendEmailDialog, setShowSendEmailDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  // Photo filters state
  const [photoFilters, setPhotoFilters] = useState<PhotoFilterParams>({
    category_id: undefined as number | null | undefined,
    search: '',
    sort: 'date',
    order: 'desc' as 'asc' | 'desc'
  });

  // Feedback filters state for export
  const [feedbackFilters, setFeedbackFilters] = useState<FeedbackFilters>({
    minRating: null,
    hasLikes: false,
    hasFavorites: false,
    hasComments: false,
    colorLabels: [],
    myColorLabels: [],
    logic: 'AND'
  });

  // Fetch event details
  // dataUpdatedAt doubles as the "password may have changed" signal for the
  // share card (#1271): every successful (re)fetch — after an edit, a PIN
  // change, a publish, a reset — drops a revealed copy, even when the event
  // comes back structurally equal and therefore reference-equal.
  const { data: event, isLoading: eventLoading, isError: eventError, refetch: refetchEvent, dataUpdatedAt: eventUpdatedAt } = useQuery({
    queryKey: ['admin-event', id],
    queryFn: () => eventsService.getEvent(parseInt(id!)),
    enabled: !!id,
  });

  // Flip the expiry banner live when the timestamp passes with the page open
  // (#909 review) — isExpired further down is computed inline from Date.now().
  // Kept here with the other hooks, above the loading early-return.
  const [, setExpiryTick] = useState(0);
  const bumpExpiryTick = useCallback(() => setExpiryTick((n) => n + 1), []);
  useExpiryRefresh([event?.expires_at], bumpExpiryTick);

  // Fetch feedback settings
  const { data: eventFeedbackSettings, isLoading: feedbackSettingsLoading } = useQuery({
    queryKey: ['admin-event-feedback-settings', id],
    queryFn: () => feedbackService.getEventFeedbackSettings(id!),
    enabled: !!id,
  });

  // Guests exist in guest identity mode, and for uploader names (#1561) in
  // any mode — the host must be able to remove or merge those too.
  const showGuestsTab = eventHasGuests(event, eventFeedbackSettings);

  // Guests is only rendered when the event can have any, so a ?tab=guests
  // deep link on any other event would show an empty content area. Snap back
  // once both have actually loaded — not while they're still undefined.
  useEffect(() => {
    if (feedbackSettingsLoading || eventLoading) return;
    if (activeTab === 'guests' && !showGuestsTab) {
      setActiveTab('overview');
    }
  }, [feedbackSettingsLoading, eventLoading, showGuestsTab, activeTab]);

  // Statistics are now fetched with the event details from the admin API

  // Merge feedback filters into photo query params so the grid reflects
  // the Has Likes / Has Favorites / Has Comments / min rating checkboxes.
  const combinedPhotoFilters: PhotoFilterParams = useMemo(() => ({
    ...photoFilters,
    hasLikes: feedbackFilters.hasLikes || undefined,
    hasFavorites: feedbackFilters.hasFavorites || undefined,
    hasComments: feedbackFilters.hasComments || undefined,
    minRating: feedbackFilters.minRating ?? undefined,
    colorLabels: feedbackFilters.colorLabels?.length ? feedbackFilters.colorLabels : undefined,
    myColorLabels: feedbackFilters.myColorLabels?.length ? feedbackFilters.myColorLabels : undefined,
    logic: feedbackFilters.logic,
  }), [photoFilters, feedbackFilters]);

  // Fetch photos (needed for both photos tab and hero photo selector).
  // While any photo is still in pending/processing state we poll every
  // 2s so the admin grid auto-updates as the background worker drains
  // the queue. Once everything is complete/failed the polling stops.
  const { data: photos = [], isLoading: photosLoading, isError: photosError, refetch: refetchPhotos } = useQuery({
    queryKey: ['admin-event-photos', id, combinedPhotoFilters],
    queryFn: () => photosService.getEventPhotos(parseInt(id!), combinedPhotoFilters),
    enabled: !!id && activeTab === 'photos',
    refetchInterval: (query) => {
      const data = query.state.data as AdminPhoto[] | undefined;
      if (!Array.isArray(data)) return false;
      const inFlight = data.some(
        (p: any) => p.processing_status === 'pending' || p.processing_status === 'processing'
      );
      return inFlight ? 2000 : false;
    },
  });

  // The hero picker offers every photo, not the Photos tab's filtered view (spec P2).
  const { data: heroPhotos = [] } = useQuery({
    queryKey: ['admin-event-photos', id, 'hero-picker'],
    queryFn: () => photosService.getEventPhotos(parseInt(id!), {}),
    enabled: !!id && activeTab === 'settings',
  });

  // CSS templates for the Appearance section, loaded with the Settings tab.
  const { data: cssTemplates = [] } = useQuery({
    queryKey: ['css-templates-enabled'],
    queryFn: () => cssTemplatesService.getEnabledTemplates(),
    enabled: activeTab === 'settings',
  });

  // Fetch filter summary for feedback filters
  const { data: filterSummary } = useQuery({
    queryKey: ['admin-event-filter-summary', id],
    queryFn: () => photosService.getFilterSummary(parseInt(id!)),
    enabled: !!id && activeTab === 'photos',
  });

  const mediaTypes = useMemo(() => {
    const types = new Set<'photo' | 'video'>();
    photos.forEach((p) => {
      const mediaType = (p.media_type as 'photo' | 'video' | undefined)
        || ((p.mime_type && String(p.mime_type).startsWith('video/')) || p.type === 'video' ? 'video' : 'photo');
      if (mediaType === 'video' || mediaType === 'photo') {
        types.add(mediaType);
      }
    });
    return types;
  }, [photos]);

  const showMediaFilter = mediaTypes.has('photo') && mediaTypes.has('video');

  useEffect(() => {
    if (!showMediaFilter && photoFilters.media_type) {
      setPhotoFilters(prev => ({ ...prev, media_type: undefined }));
    }
  }, [showMediaFilter, photoFilters.media_type]);

  const { data: publicSettings } = usePublicSettings();
  const phoneFieldEnabled = publicSettings?.event_phone_field_enabled === true;

  // Fetch categories for the event
  const { data: categories = [] } = useQuery({
    queryKey: ['admin-event-categories', id],
    queryFn: async () => {
      const response = await eventsService.getEventCategories(parseInt(id!));
      return response || [];
    },
    enabled: !!id,
  });

  // The Settings tab's draft (spec 5.2): only what the user changed.
  const draft = useEventDraft();
  const serverForm = useMemo(() => (event ? eventFormValues(event) : INITIAL_EDIT_FORM), [event]);
  const [editForm, setEditForm] = useDraftObject(draft, 'event', serverForm);
  const serverFeedback = useMemo(() => (eventFeedbackSettings ?? {}) as FeedbackSettingsType, [eventFeedbackSettings]);
  const [feedbackSettings, setFeedbackSettings] = useDraftObject(draft, 'feedback', serverFeedback);
  const serverTheme = useMemo<ThemeDraft>(
    () => (event
      ? themeValue(event, publicSettings?.theme_config as ThemeConfig | undefined)
      : { config: GALLERY_THEME_PRESETS.default.config, preset: 'default' }),
    [event, publicSettings?.theme_config],
  );
  const theme = (draft.state['event.__theme']?.value as ThemeDraft | undefined) ?? serverTheme;
  const { update: updateDraft } = draft;
  const setTheme = useCallback(
    (fn: (current: ThemeDraft) => ThemeDraft) => updateDraft('event', '__theme', (cur) => fn(cur as ThemeDraft), serverTheme),
    [updateDraft, serverTheme],
  );
  const { allowNextNavigation } = useNavigationGuard(draft.isDirty);
  const [expert, setExpert] = useExpertMode();
  const { hasPermission } = usePermissions();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const section = (searchParams.get('section') as SectionId | null) ?? 'details';
  const setSection = (sectionId: SectionId) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', sectionId);
    setSearchParams(next, { replace: true });
  };
  const sectionLabel = useSectionLabel();
  const changedElsewhereSections = useMemo(() => {
    const server: Record<string, unknown> = { 'event.__theme': serverTheme };
    for (const [k, v] of Object.entries(serverForm)) server[`event.${k}`] = v;
    for (const [k, v] of Object.entries(serverFeedback)) server[`feedback.${k}`] = v;
    const ids = new Set<SectionId>();
    for (const key of Object.keys(draft.state)) {
      if (key in server && isChangedElsewhere(draft.state, key, server[key])) {
        const sectionId = sectionOf(key);
        if (sectionId) ids.add(sectionId);
      }
    }
    return [...ids].map(sectionLabel);
  }, [draft.state, serverForm, serverFeedback, serverTheme, sectionLabel]);

  const PART_LABEL: Record<DraftPart, [string, string]> = {
    event: ['events.saveBar.partEvent', 'event details'],
    feedback: ['events.saveBar.partFeedback', 'guest feedback'],
    quota: ['events.saveBar.partQuota', 'download allowance'],
    resolution: ['events.saveBar.partResolution', 'download resolution'],
  };

  // Event PUT, then feedback, allowance and resolution, each only when changed.
  const handleSave = async () => {
    if (!event) return;
    const changed = new Set(Object.keys(changesFor(draft.state, 'event')));
    const invalid = validateDraft(changed, editForm, serverForm);
    if (invalid) {
      toast.error(t(invalid.key, invalid.fallback));
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const result = await runSave(draft.state, () => buildEventPayload(changed, editForm, theme, serverTheme), {
      updateEvent: (payload) => eventsService.updateEvent(event.id, payload),
      updateFeedback: (payload) => feedbackService.updateEventFeedbackSettings(String(event.id), payload),
      updateQuota: (payload) => api.put(`/admin/events/${event.id}/download-quota`, payload),
      updateResolution: (payload) => api.patch(`/admin/events/${event.id}/download-resolutions`, payload),
    });
    setIsSaving(false);
    draft.dropParts(result.saved);
    if (result.saved.includes('event')) queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    if (result.saved.includes('feedback')) queryClient.invalidateQueries({ queryKey: ['admin-event-feedback-settings', id] });
    if (result.saved.includes('quota')) queryClient.invalidateQueries({ queryKey: ['admin-download-quota', event.id] });
    if (result.saved.includes('resolution')) {
      queryClient.invalidateQueries({ queryKey: ['event-download-resolutions', event.id] });
      refetchEvent();
    }
    if (result.failed) {
      const [key, fallback] = PART_LABEL[result.failed.part];
      setSaveError(t('events.saveBar.failed', 'Not saved: {{parts}}. Your other changes were saved.', { parts: t(key, fallback) }));
    } else {
      toast.success(t('toast.eventUpdated'));
    }
  };

  // Archive mutation
  // Reveal now (#838)
  const revealMutation = useMutation({
    mutationFn: () => eventsService.revealEvent(Number(id)),
    onSuccess: () => {
      toast.success(t('events.revealedToast', 'Gallery revealed — guests can see the photos now'));
      refetchEvent();
    },
    onError: () => {
      toast.error(t('events.revealError', 'Failed to reveal the gallery'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => eventsService.archiveEvent(parseInt(id!)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      toast.success(t('toast.eventArchived'));
    },
    onError: () => {
      toast.error(t('errors.somethingWentWrong'));
    },
  });

  // Publish mutation (Draft mode). Accepts the admin-typed password so the
  // gallery_created email can carry the real plaintext (#627).
  const publishMutation = useMutation({
    mutationFn: (vars: { password?: string; notifyCustomer?: boolean }) =>
      eventsService.publishEvent(parseInt(id!), {
        password: vars.password,
        notifyCustomer: vars.notifyCustomer,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      // Say which of the two happened — "published" and "published and
      // emailed your customer" are different enough that a single message
      // would leave the admin unsure whether anything went out (#1235).
      toast.success(
        result?.notified_customer === false
          ? t('events.publishQuietSuccess', 'Gallery published. No email was sent.')
          : t('events.publishSuccess'),
      );
      setShowPublishDialog(false);
    },
    onError: () => {
      toast.error(t('errors.somethingWentWrong'));
    },
  });

  // Send the gallery email after the fact (#1235). Pairs with publishing
  // quietly: the address usually arrives later than the gallery does.
  const sendGalleryEmailMutation = useMutation({
    mutationFn: (password?: string) =>
      eventsService.sendGalleryEmail(parseInt(id!), password ? { password } : undefined),
    onSuccess: (result) => {
      // #1262 — queueing is not delivery, and a queue nobody is working
      // reports no failure at all. Point at where the queue is visible.
      toast.success(
        `${t('events.sendGalleryEmail.success', {
          recipient: result.recipient,
          defaultValue: 'Gallery email queued to {{recipient}}.',
        })} ${t('events.emailQueuedHint', 'The queue processor sends it — check System health if it does not arrive.')}`,
      );
      setShowSendEmailDialog(false);
      // The send may have replaced the password (#627); a refetch bumps the
      // version the share card keys its revealed copy on (#1271).
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => {
      toast.error(t('errors.somethingWentWrong'));
    },
  });

  // Duplicate mutation (#626). Backend creates a draft inheriting branding +
  // behaviour + categories from the source; we navigate to the new event so
  // the admin can finish configuring + publish.
  const duplicateMutation = useMutation({
    mutationFn: (data: {
      event_name: string;
      event_date?: string;
      customer_name?: string;
      customer_email?: string;
    }) => eventsService.duplicateEvent(parseInt(id!), data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      toast.success(t('events.duplicateDialog.successToast', 'Gallery duplicated.'));
      setShowDuplicateDialog(false);
      allowNextNavigation();
      navigate(`/admin/events/${result.id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.errors?.[0]?.msg || err?.response?.data?.error;
      toast.error(msg || t('errors.somethingWentWrong'));
    },
  });

  // Extend expiration mutation
  const extendMutation = useMutation({
    mutationFn: (days: number) => {
      return eventsService.extendExpiration(parseInt(id!), days);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      toast.success(t('toast.saveSuccess'));
    },
    onError: () => {
      toast.error(t('toast.saveError'));
    },
  });

  if (eventLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading size="lg" text={t('events.loadingEventDetails')} />
      </div>
    );
  }

  // A 404 (or any settled failure) leaves `event` undefined forever — without
  // this branch the spinner above never resolved (QA 7.02).
  if (eventError || !event) {
    return (
      <Card padding="lg">
        <p className="text-heading">{t('events.notFound', 'Event not found')}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/events')}>
          {t('events.backToEvents')}
        </Button>
      </Card>
    );
  }

  const expiresAtDate = safeParseDate(event.expires_at);
  // Timestamp comparison, not truncated whole days (#909): the old
  // differenceInDays <= 0 marked events "expired" up to 24h early.
  // Ceiling keeps the countdown at "1 day" through the final day.
  const isExpired = expiresAtDate !== null && expiresAtDate.getTime() <= Date.now();
  const daysUntilExpiration = expiresAtDate
    ? Math.ceil((expiresAtDate.getTime() - Date.now()) / 86400000)
    : null;
  const isExpiring = !isExpired && daysUntilExpiration !== null && daysUntilExpiration > 0 && daysUntilExpiration <= 7;

  // Archived events and users without events.edit see Settings read-only (spec 5.2).
  const settingsLock = event.is_archived
    ? t('events.settings.lockedArchived', 'This event is archived. Its settings are read-only.')
    : !hasPermission('events.edit')
      ? t('events.settings.lockedPermission', 'Locked: needs the {{permission}} permission', { permission: 'events.edit' })
      : null;

  return (
    <div>
      {/* Page Header + Draft Banner + Expiration Warning */}
      <EventDetailsHeader
        event={event}
        id={id}
        feedbackSettings={eventFeedbackSettings}
        setShowRenameDialog={setShowRenameDialog}
        setShowPublishDialog={setShowPublishDialog}
        isPublishing={publishMutation.isPending}
        onExtendExpiration={(days) => extendMutation.mutate(days)}
        daysUntilExpiration={daysUntilExpiration}
        isExpired={isExpired}
        isExpiring={isExpiring}
      />

      {/* Tabs */}
      <EventTabs
        event={event}
        eventFeedbackSettings={eventFeedbackSettings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          event={event}
          id={id}
          passwordVersion={eventUpdatedAt}
          isEditing={false}
          editForm={editForm}
          setEditForm={setEditForm}
          feedbackSettings={feedbackSettings}
          setFeedbackSettings={setFeedbackSettings}
          categories={categories}
          photos={photos}
          phoneFieldEnabled={phoneFieldEnabled}
          daysUntilExpiration={daysUntilExpiration}
          onRevealNow={() => revealMutation.mutate()}
          refetchEvent={refetchEvent}
          setActiveTab={setActiveTab}
          setShowPasswordReset={setShowPasswordReset}
          setShowPublishDialog={setShowPublishDialog}
          setShowDuplicateDialog={setShowDuplicateDialog}
          onSendGalleryEmail={() => setShowSendEmailDialog(true)}
          isSendingGalleryEmail={sendGalleryEmailMutation.isPending}
          onArchive={() => archiveMutation.mutate()}
          isArchiving={archiveMutation.isPending}
          isPublishing={publishMutation.isPending}
          isDuplicating={duplicateMutation.isPending}
        />
      )}

      {/* Photos Tab */}
      {activeTab === 'photos' && (
        <PhotosTab
          event={event}
          id={id}
          photos={photos}
          photosLoading={photosLoading}
          photosError={photosError}
          refetchPhotos={refetchPhotos}
          categories={categories}
          photoFilters={photoFilters}
          setPhotoFilters={setPhotoFilters}
          feedbackFilters={feedbackFilters}
          setFeedbackFilters={setFeedbackFilters}
          filterSummary={filterSummary}
          showMediaFilter={showMediaFilter}
        />
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <CategoriesTab id={id} />
      )}

      {/* Guests Tab (guest identity mode, or uploader names on) */}
      {activeTab === 'guests' && showGuestsTab && (
        <AdminGuestsList eventId={parseInt(id!)} eventName={event.event_name} />
      )}

      {/* Download ledger (migration 214) */}
      {activeTab === 'downloads' && (
        <DownloadLedgerTab eventId={parseInt(id!)} />
      )}

      {/* Settings tab (spec 5.1): one section at a time, saved by the bar */}
      {activeTab === 'settings' && (
        <EventSettingsContext.Provider value={{
          event, editForm, setEditForm, feedbackSettings, setFeedbackSettings, theme, setTheme, draft,
          readOnly: settingsLock !== null, lockReason: settingsLock, expert, setExpert, refetchEvent,
          categories, phoneFieldEnabled, heroPhotos, cssTemplates,
        }}>
          <EventSettingsTab section={section} onSection={setSection} />
        </EventSettingsContext.Provider>
      )}

      {settingsLock === null && (
        <EventSaveBar
          count={draft.count}
          isSaving={isSaving}
          error={saveError}
          changedElsewhere={changedElsewhereSections}
          onSave={handleSave}
          onDiscard={() => { draft.discard(); setSaveError(null); }}
        />
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <PasswordResetModal
          eventName={event.event_name}
          eventDate={event.event_date ?? undefined}
          eventType={event.event_type}
          onConfirm={async (sendEmail, password) => {
            const result = await eventsService.resetPassword(event.id, sendEmail, password);
            // refetch so the share card drops a revealed password (#1271)
            queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
            return result;
          }}
          onClose={() => setShowPasswordReset(false)}
        />
      )}

      {/* Event Rename Dialog */}
      <EventRenameDialog
        isOpen={showRenameDialog}
        eventName={event.event_name}
        eventId={event.id}
        customerEmail={event.customer_email}
        onClose={() => setShowRenameDialog(false)}
        onRename={async (newName, resendEmail) => {
          const result = await eventsService.renameEvent(event.id, newName, resendEmail);
          if (result.success) {
            queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
            queryClient.invalidateQueries({ queryKey: ['admin-events'] });
            toast.success(t('events.rename.success', 'Event renamed successfully!'));
          }
          return result;
        }}
        onValidate={(newName) => eventsService.validateRename(event.id, newName)}
      />

      {/* Publish Gallery Dialog (#627) — prompts for the password so the
          gallery_created email carries the real plaintext, not the sentinel. */}
      {showPublishDialog && (
        <PublishGalleryDialog
          eventName={event.event_name}
          requirePassword={!isGalleryPublic(event.require_password)}
          customerEmail={event.customer_email}
          customerPhone={event.customer_phone}
          assignedCustomerCount={((event as { customer_accounts?: Array<{ id: number }> }).customer_accounts || []).length}
          isPublishing={publishMutation.isPending}
          onConfirm={(password, notifyCustomer) => publishMutation.mutate({ password, notifyCustomer })}
          onClose={() => {
            if (!publishMutation.isPending) setShowPublishDialog(false);
          }}
        />
      )}

      {/* Send Gallery Email Dialog (#1235) — asks for the password for the
          same reason publish does: the plaintext only exists in this request,
          and this action is most useful right after a quiet publish, which
          never collected one. */}
      {showSendEmailDialog && (
        <SendGalleryEmailDialog
          eventName={event.event_name}
          recipient={event.customer_email}
          // Only the inline-email path carries the password. With no
          // customer_email the backend takes the account fallback, which sends
          // customer_gallery_assigned — a portal link that never mentions a
          // password — and deliberately skips the rehash (crud.js). Asking for
          // one there blocks the send behind a value nothing consumes, and the
          // dialog's promise that it will be rehashed would be false.
          requirePassword={!!event.customer_email && !isGalleryPublic(event.require_password)}
          isSending={sendGalleryEmailMutation.isPending}
          onConfirm={(password) => sendGalleryEmailMutation.mutate(password)}
          onClose={() => {
            if (!sendGalleryEmailMutation.isPending) setShowSendEmailDialog(false);
          }}
        />
      )}

      {/* Duplicate Event Dialog (#626) — admin types a new event name/date
          (+ optional customer); backend clones the source gallery's config
          and we navigate to the new draft. */}
      {showDuplicateDialog && (
        <DuplicateEventDialog
          sourceEventName={event.event_name}
          isDuplicating={duplicateMutation.isPending}
          onConfirm={(data) => duplicateMutation.mutate(data)}
          onClose={() => {
            if (!duplicateMutation.isPending) setShowDuplicateDialog(false);
          }}
        />
      )}

    </div>
  );
};

EventDetailsPage.displayName = 'EventDetailsPage';
