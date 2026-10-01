import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button, Card, Input, LocalizedDateInput } from '../../../components/common';
import { IdentityModeField, WelcomeMessageEditor } from '../../../components/admin';
import { CustomerAccountPicker } from '../../../components/admin/CustomerAccountPicker';
import { eventsService } from '../../../services/events.service';
import { adminDownloadQuotaService } from '../../../services/adminDownloadQuota.service';
import { useIsMounted } from '../../../hooks/useIsMounted';
import { useNavigationGuard } from '../../../hooks/useNavigationGuard';
import { AdvancedArea, useExpertMode } from '../event-details/settings/AdvancedArea';
import { CustomerFields } from '../event-details/settings/CustomerFields';
import { ExpiryField } from '../event-details/settings/ExpiryField';
import { FeedbackModeSelector } from '../event-details/settings/FeedbackModeSelector';
import { PasswordField } from '../event-details/settings/PasswordField';
import { PhotoSourceFields } from '../event-details/settings/PhotoSourceFields';
import { applyFeedbackMode, feedbackMode, offeredModes } from '../event-details/settings/feedbackMode';
import { EventTypeTiles } from './EventTypeTiles';
import {
  brandingThemeOf, buildCreatePayload, createDefaults, createRequirements, generatedPassword,
  initialCreateForm, validateCreateForm, type CreateErrorField, type CreateForm, type CreateType,
} from './createForm';

type Settings = Record<string, unknown> | undefined;

/**
 * The create screen (spec 5.5), built from the same fields as the event
 * page's Settings tab. The essentials are visible; everything else is under
 * "Advanced options". Submitting creates a draft and opens its Overview.
 */
export const CreateEventForm: React.FC<{ publicSettings: Settings; adminSettings: Settings; types: CreateType[] }> = ({
  publicSettings, adminSettings, types,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMountedRef = useIsMounted();
  // Re-entrancy guard for the create submit (QA 7.03): the button's disabled
  // state does not cover an implicit form submission or a requestSubmit.
  const isSubmittingRef = useRef(false);
  const [expert] = useExpertMode();
  const requirements = useMemo(() => createRequirements(publicSettings), [publicSettings]);
  const phoneFieldEnabled = publicSettings?.event_phone_field_enabled === true;
  const [defaults] = useState(() => createDefaults(publicSettings, adminSettings, types));
  const [initial] = useState(() => initialCreateForm(defaults));
  const [form, setForm] = useState<CreateForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<CreateErrorField, string>>>({});
  const [created, setCreated] = useState(false);
  // Spec 5.2: leaving asks while the form differs from its defaults; the
  // redirect after a create is let through.
  const { allowNextNavigation } = useNavigationGuard(!created && JSON.stringify(form) !== JSON.stringify(initial));
  const type = types.find((candidate) => candidate.slug === form.event_type);
  const typeName = type?.name ?? '';
  const message = (key: string | undefined) => (key ? t(key) : undefined);

  const set = <K extends keyof CreateForm>(field: K, value: CreateForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Switching protection on is the user's own action: start with a generated
  // password. Off forgets a typed one, so a hidden field never rides along.
  const onPasswordToggle = (on: boolean) => {
    setForm((prev) => ({ ...prev, require_password: on, password: on ? (prev.password || generatedPassword(prev, typeName, '')) : '' }));
    setErrors((prev) => ({ ...prev, password: undefined }));
  };
  const onClientAccessToggle = (on: boolean) => {
    setForm((prev) => ({
      ...prev,
      client_access_enabled: on,
      client_password: on ? (prev.client_password || generatedPassword(prev, typeName, '')) : '',
    }));
    setErrors((prev) => ({ ...prev, client_password: undefined }));
  };

  const createMutation = useMutation({
    mutationFn: eventsService.createEvent,
    onSuccess: async (data) => {
      // Auto-approve lives on the download allowance settings, which the
      // create route never touches, so it is a second call. A failure must not
      // block the event the photographer already got.
      if (form.download_order_auto_approve) {
        try {
          await adminDownloadQuotaService.saveQuota(data.id, { auto_approve: true });
        } catch {
          toast.error(t('errors.autoApproveSaveError'));
        }
      }
      if (isMountedRef.current) {
        toast.success(t('toast.eventCreated'));
        setCreated(true);
        allowNextNavigation();
        navigate(`/admin/events/${data.id}`);
      }
    },
    onError: (error: any) => {
      const validationErrors = error.response?.data?.errors;
      if (Array.isArray(validationErrors)) {
        validationErrors.forEach((err: any) => toast.error(`${err.path || err.param}: ${err.msg}`));
      } else {
        toast.error(error.response?.data?.error || error.message || t('errors.eventCreationFailed'));
      }
    },
    onSettled: () => {
      isSubmittingRef.current = false;
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    const found = validateCreateForm(form, requirements);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    isSubmittingRef.current = true;
    createMutation.mutate(buildCreatePayload(form, {
      phoneFieldEnabled,
      themePreset: type?.themePreset,
      brandingTheme: brandingThemeOf(publicSettings),
    }) as unknown as Parameters<typeof eventsService.createEvent>[0]);
  };

  const checkbox = 'mt-1 w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500';
  const mode = feedbackMode(form.feedback);
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/admin/events')}>
          {t('common.back')}
        </Button>
        <h1 className="text-2xl font-bold text-heading">{t('events.create')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card padding="md">
          <h2 className="text-lg font-semibold text-heading mb-4">{t('events.eventDetails')}</h2>
          <div className="space-y-4">
            <EventTypeTiles types={types} value={form.event_type} onChange={(slug) => set('event_type', slug)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('events.eventName')}
                placeholder={t('events.eventNamePlaceholder')}
                value={form.event_name}
                onChange={(e) => set('event_name', e.target.value)}
                error={message(errors.event_name)}
              />
              <LocalizedDateInput
                label={requirements.eventDate ? t('events.eventDate') : `${t('events.eventDate')} (${t('common.optional')})`}
                value={form.event_date}
                onChange={(iso) => set('event_date', iso)}
                error={message(errors.event_date)}
              />
            </div>
            <CustomerFields
              values={form}
              onChange={(field, value) => set(field, value)}
              phoneFieldEnabled={phoneFieldEnabled}
              required={{ name: requirements.customerName, email: requirements.customerEmail }}
              errors={{ customer_name: message(errors.customer_name), customer_email: message(errors.customer_email) }}
            />
            <CustomerAccountPicker value={form.customer_accounts} onChange={(next) => set('customer_accounts', next)} />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-heading mb-4">{t('events.accessAndSecurity')}</h2>
          <div className="space-y-4">
            <label className="flex items-start gap-2">
              <input type="checkbox" className={checkbox} checked={form.require_password} onChange={(e) => onPasswordToggle(e.target.checked)} />
              <span>
                <span className="text-sm font-medium text-body">{t('events.requirePasswordToggle')}</span>
                <span className="block text-xs text-muted mt-1">
                  {t('events.requirePasswordToggleHelp', 'Disable this if you want to share the gallery without a password. Anyone with the link will be able to view the photos.')}
                </span>
              </span>
            </label>
            {!form.require_password && (
              <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
                {t('events.publicGalleryWarning', 'Public galleries are accessible to anyone with the link. Consider watermarking downloaded files in Branding and monitoring activity.')}
              </div>
            )}
            {form.require_password && (
              <PasswordField
                label={t('events.galleryPassword')}
                value={form.password}
                onChange={(value) => set('password', value)}
                placeholder={t('events.passwordPlaceholder')}
                helperText={t('events.passwordHelperText', 'You can use dates like "04.07.2025" or any text with 6+ characters')}
                onRegenerate={() => set('password', generatedPassword(form, typeName, form.password))}
                regenerateLabel={t('events.access.regenerate', 'Regenerate')}
                error={message(errors.password)}
              />
            )}

            <div className="pt-4 border-t border-line">
              <h3 className="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                {t('clientAccess.adminTitle')}
              </h3>
              <label className="flex items-start gap-2">
                <input type="checkbox" className={checkbox} checked={form.client_access_enabled} onChange={(e) => onClientAccessToggle(e.target.checked)} />
                <span>
                  <span className="text-sm font-medium text-body">{t('clientAccess.enableToggle')}</span>
                  <span className="block text-xs text-muted mt-1">{t('clientAccess.enableDescription')}</span>
                </span>
              </label>
              {form.client_access_enabled && (
                <div className="mt-3 space-y-2">
                  <PasswordField
                    label={t('clientAccess.passwordLabel')}
                    value={form.client_password}
                    onChange={(value) => set('client_password', value)}
                    placeholder={t('clientAccess.passwordPlaceholder')}
                    helperText={t('clientAccess.passwordHelperText')}
                    onRegenerate={() => set('client_password', generatedPassword(form, typeName, form.client_password))}
                    regenerateLabel={t('clientAccess.generate', 'Generate')}
                    error={message(errors.client_password)}
                  />
                  {/* The link cannot exist yet: client_share_token is minted
                      with the event. */}
                  <p className="text-xs text-muted">{t('clientAccess.linkAfterCreate')}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card padding="md">
          <ExpiryField value={form.expires_at} onChange={(iso) => set('expires_at', iso)} allowNever={!requirements.expiration} />
          {errors.expires_at && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{message(errors.expires_at)}</p>}
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDownloads', 'Downloads')}</h2>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className={checkbox}
              checked={form.download_order_auto_approve}
              onChange={(e) => set('download_order_auto_approve', e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium text-body">{t('downloadQuotaAdmin.card.autoApproveLabel')}</span>
              <span className="block text-xs text-muted mt-1">{t('downloadQuotaAdmin.card.autoApproveHelp')}</span>
            </span>
          </label>
        </Card>

        <AdvancedArea expert={expert} forceOpen={!!errors.external_path}>
          <Card padding="md">
            <label className="block text-sm font-medium text-body mb-1">{t('events.welcomeMessageLabel')}</label>
            <WelcomeMessageEditor
              value={form.welcome_message}
              onChange={(value) => set('welcome_message', value)}
              placeholder={t('events.welcomeMessagePlaceholder')}
              rows={4}
            />
          </Card>
          <Card padding="md">
            <div className="space-y-4">
              <PhotoSourceFields
                values={form}
                onChange={(patch) => {
                  setForm((prev) => ({ ...prev, ...patch }));
                  setErrors((prev) => ({ ...prev, external_path: undefined }));
                }}
                folderError={message(errors.external_path)}
              />
            </div>
          </Card>
          <Card padding="md">
            <div className="space-y-4">
              <FeedbackModeSelector
                mode={mode}
                offered={offeredModes(form.feedback, defaults.feedback)}
                fromSettings={feedbackMode({ ...defaults.feedback, feedback_enabled: true }) === 'custom'}
                onSelect={(next) => set('feedback', applyFeedbackMode(form.feedback, defaults.feedback, next))}
              />
              {mode !== 'off' && (
                <IdentityModeField
                  value={form.feedback.identity_mode}
                  onChange={(identity_mode) => set('feedback', { ...form.feedback, identity_mode })}
                />
              )}
            </div>
          </Card>
        </AdvancedArea>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/events')}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" isLoading={createMutation.isPending} disabled={createMutation.isPending}>
            {t('events.createEvent')}
          </Button>
        </div>
      </form>
    </div>
  );
};
