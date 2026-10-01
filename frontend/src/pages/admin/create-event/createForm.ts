import { format as formatDate } from 'date-fns';
import { GALLERY_THEME_PRESETS, type ThemeConfig } from '../../../types/legacyGalleryTheme.types';
import type { FeedbackSettings } from '../../../services/feedback.service';
import { nextEventPassword } from '../../../utils/passwordGenerator';
import { expiryFromToday } from '../event-details/settings/ExpiryField';
import type { PhotoSourceValues } from '../event-details/settings/PhotoSourceFields';

/** The feedback values the create screen sets (spec 5.5, 5.7). */
export type CreateFeedback = Pick<FeedbackSettings,
  'feedback_enabled' | 'allow_favorites' | 'allow_likes' | 'allow_ratings' | 'allow_comments' | 'allow_reactions' | 'identity_mode'>;

export interface CreateForm extends PhotoSourceValues {
  event_type: string;
  event_name: string;
  event_date: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_accounts: Array<{ id: number; email: string; displayName: string | null }>;
  require_password: boolean;
  password: string;
  client_access_enabled: boolean;
  client_password: string;
  /** yyyy-MM-dd, or '' for Never (spec 5.8). */
  expires_at: string;
  download_order_auto_approve: boolean;
  welcome_message: string;
  feedback: CreateFeedback;
}

export interface CreateType { slug: string; name: string; emoji: string; themePreset: string }

export interface CreateDefaults {
  type: CreateType | null;
  requirePassword: boolean;
  expiryDays: number;
  feedback: CreateFeedback;
  today: Date;
}

export interface CreateRequirements { customerName: boolean; customerEmail: boolean; eventDate: boolean; expiration: boolean }

export type CreateErrorField =
  'event_name' | 'event_date' | 'customer_name' | 'customer_email' | 'password' | 'client_password' | 'expires_at' | 'external_path';

type Settings = Record<string, unknown> | undefined;

/** What a new event starts with, from Settings and the type catalog (spec 2, 5.4, 5.7, 5.8). */
export function createDefaults(publicSettings: Settings, adminSettings: Settings, types: CreateType[], today: Date = new Date()): CreateDefaults {
  const pub = publicSettings ?? {};
  const days = Number(adminSettings?.general_default_expiration_days);
  return {
    type: types.find((type) => type.slug === 'wedding') ?? types[0] ?? null,
    requirePassword: pub.event_default_require_password !== false,
    expiryDays: Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30,
    feedback: {
      feedback_enabled: pub.event_default_feedback_enabled === true,
      allow_favorites: pub.event_default_allow_favorites !== false,
      allow_likes: pub.event_default_allow_likes !== false,
      allow_ratings: pub.event_default_allow_ratings !== false,
      allow_comments: pub.event_default_allow_comments !== false,
      allow_reactions: pub.event_default_allow_reactions !== false,
      identity_mode: 'simple',
    },
    today,
  };
}

export function initialCreateForm(d: CreateDefaults): CreateForm {
  const eventDate = formatDate(d.today, 'yyyy-MM-dd');
  return {
    event_type: d.type?.slug ?? '',
    event_name: '',
    event_date: eventDate,
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_accounts: [],
    require_password: d.requirePassword,
    // Spec 5.4: the field starts with a generated password, from the type and date.
    password: d.requirePassword ? nextEventPassword(d.type?.name ?? '', eventDate) : '',
    client_access_enabled: false,
    client_password: '',
    expires_at: expiryFromToday(d.expiryDays, d.today),
    download_order_auto_approve: false,
    welcome_message: '',
    source_mode: 'managed',
    external_path: '',
    external_watch: false,
    photo_cap: 0,
    default_photo_sort: 'upload_date_desc',
    feedback: { ...d.feedback },
  };
}

/** The next generated password: from the name typed so far, else the type's name (spec 5.4). */
export function generatedPassword(form: CreateForm, typeName: string, current: string): string {
  return nextEventPassword(form.event_name.trim() || typeName, form.event_date, current);
}

export function createRequirements(publicSettings: Settings): CreateRequirements {
  const pub = publicSettings ?? {};
  return {
    customerName: pub.event_require_customer_name !== false,
    customerEmail: pub.event_require_customer_email !== false,
    eventDate: pub.event_require_event_date !== false,
    expiration: pub.event_require_expiration !== false,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordError(value: string, digitsOnly: RegExp): string | null {
  if (!value) return 'validation.passwordRequired';
  if (value.length < 6) return 'validation.passwordMinLength';
  if (digitsOnly.test(value)) return 'validation.passwordTooSimple';
  return null;
}

/** Field errors as i18n keys; empty when the form can be sent. */
export function validateCreateForm(form: CreateForm, req: CreateRequirements): Partial<Record<CreateErrorField, string>> {
  const errors: Partial<Record<CreateErrorField, string>> = {};
  if (!form.event_name.trim()) errors.event_name = 'validation.eventNameRequired';
  if (req.eventDate && !form.event_date) errors.event_date = 'validation.eventDateRequired';
  if (req.customerName && !form.customer_name.trim()) errors.customer_name = 'validation.hostNameRequired';
  if (req.customerEmail && !form.customer_email.trim()) errors.customer_email = 'validation.hostEmailRequired';
  else if (form.customer_email.trim() && !EMAIL.test(form.customer_email.trim())) errors.customer_email = 'validation.invalidEmailFormat';
  // The gallery floor keeps the old page's rule (six digits refused), the
  // client floor refuses any all-digit value, as before.
  if (form.require_password) {
    const error = passwordError(form.password, /^\d{1,6}$/);
    if (error) errors.password = error;
  }
  if (form.client_access_enabled) {
    const error = passwordError(form.client_password, /^\d+$/);
    if (error) errors.client_password = error;
  }
  if (req.expiration && !form.expires_at) errors.expires_at = 'validation.expiryRequired';
  if (form.source_mode === 'reference' && !form.external_path.trim()) errors.external_path = 'validation.externalFolderRequired';
  return errors;
}

/** Branding's theme from public settings, which may carry it as an object or a JSON string. */
export function brandingThemeOf(publicSettings: Settings): Partial<ThemeConfig> | null {
  const raw = publicSettings?.theme_config;
  if (raw && typeof raw === 'object') return raw as Partial<ThemeConfig>;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    try { return JSON.parse(raw) as Partial<ThemeConfig>; } catch { return null; }
  }
  return null;
}

/**
 * The theme a new event stores (spec 5.5): nothing, so it follows Branding
 * live, unless the type has a preset other than 'default', whose name is
 * stored. The server always writes the header and divider style columns and
 * the gallery reads them first, so they come from that preset, else from
 * Branding's theme, as the old create page did.
 */
export function createThemeFields(themePreset: string | undefined, brandingTheme: Partial<ThemeConfig> | null | undefined) {
  const preset = themePreset && themePreset !== 'default' ? GALLERY_THEME_PRESETS[themePreset] : undefined;
  const source: Partial<ThemeConfig> = preset ? preset.config : brandingTheme ?? {};
  return {
    ...(preset ? { color_theme: themePreset } : {}),
    ...(source.headerStyle ? { header_style: source.headerStyle } : {}),
    ...(source.heroDividerStyle ? { hero_divider_style: source.heroDividerStyle } : {}),
  };
}

export interface PayloadContext {
  phoneFieldEnabled: boolean;
  themePreset: string | undefined;
  brandingTheme: Partial<ThemeConfig> | null;
}

/** The create request. Fields not on the screen are left to the server's defaults. */
export function buildCreatePayload(form: CreateForm, ctx: PayloadContext): Record<string, unknown> {
  const f = form.feedback;
  const phone = form.customer_phone.trim();
  return {
    event_type: form.event_type,
    event_name: form.event_name.trim(),
    event_date: form.event_date || undefined,
    customer_name: form.customer_name.trim(),
    customer_email: form.customer_email.trim(),
    ...(ctx.phoneFieldEnabled && phone ? { customer_phone: phone } : {}),
    ...(form.customer_accounts.length ? { customer_account_ids: form.customer_accounts.map((c) => c.id) } : {}),
    require_password: form.require_password,
    ...(form.require_password ? { password: form.password } : {}),
    client_access_enabled: form.client_access_enabled,
    ...(form.client_access_enabled ? { client_password: form.client_password } : {}),
    // A date, or null for Never (spec 5.8); expiration_days is never sent.
    expires_at: form.expires_at || null,
    welcome_message: form.welcome_message,
    ...createThemeFields(ctx.themePreset, ctx.brandingTheme),
    source_mode: form.source_mode,
    ...(form.source_mode === 'reference'
      ? { external_path: form.external_path.trim(), external_watch: form.external_watch }
      : {}),
    photo_cap: form.photo_cap > 0 ? form.photo_cap : null,
    default_photo_sort: form.default_photo_sort,
    feedback_enabled: f.feedback_enabled,
    allow_favorites: f.allow_favorites,
    allow_likes: f.allow_likes,
    allow_ratings: f.allow_ratings,
    allow_comments: f.allow_comments,
    allow_reactions: f.allow_reactions,
    identity_mode: f.identity_mode ?? 'simple',
  };
}
