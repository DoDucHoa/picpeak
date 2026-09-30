import { format } from 'date-fns';
import type { Event } from '../../../../types';
import type { CustomerGroup } from '../../../../services/customerAdmin.service';
import { GALLERY_THEME_PRESETS, type ThemeConfig } from '../../../../types/theme.types';
import { normalizeRequirePassword } from '../../../../utils/accessControl';
import type { EditFormState, ThemeDraft } from '../types';
import { safeParseDate } from '../utils';

/**
 * What the Settings tab shows for a saved event. Moved from the page's old
 * handleStartEdit, value for value, so the controls see exactly what they saw
 * in edit mode; the draft compares against it, so opening the tab changes
 * nothing (spec 5.2).
 */
export function eventFormValues(event: Event): EditFormState {
  const expiresAtDate = safeParseDate(event.expires_at);
  return {
    welcome_message: event.welcome_message || '',
    color_theme: event.color_theme || '',
    css_template_id: event.css_template_id || null,
    expires_at: expiresAtDate ? format(expiresAtDate, 'yyyy-MM-dd') : '',
    show_credits_to_guests: Boolean(event.show_credits_to_guests),
    hero_photo_id: event.hero_photo_id || null,
    customer_name: event.customer_name || '',
    customer_email: event.customer_email || '',
    customer_phone: event.customer_phone || '',
    source_mode: event.source_mode === 'reference' ? 'reference' : 'managed',
    external_path: event.external_path || '',
    external_watch: Boolean(event.external_watch),
    require_password: normalizeRequirePassword(event.require_password),
    new_password: '',
    confirm_new_password: '',
    // Load protection settings from event
    protection_level: event.protection_level || 'standard',
    allow_downloads: event.allow_downloads ?? true,
    // Load hero logo settings from event. Preserve null = "inherit global"
    // (#756), don't collapse it to true, or saving would snapshot an override.
    hero_logo_visible: event.hero_logo_visible ?? null,
    // Preserve null = "inherit global size" (#756), don't collapse to medium.
    hero_logo_size: event.hero_logo_size ?? null,
    hero_logo_position: event.hero_logo_position || 'top',
    // #894: null = default (show); only false hides the password-page logo.
    // Boolean() folds SQLite's 0/1 into real booleans so the edit form's
    // strict `=== false` check reads a persisted hide correctly.
    login_logo_visible: event.login_logo_visible == null ? null : Boolean(event.login_logo_visible),
    // Hero image anchor position (#162)
    hero_image_anchor: event.hero_image_anchor || 'center',
    // Photo cap
    photo_cap: event.photo_cap || 0,
    // Default photo sort
    default_photo_sort: event.default_photo_sort || 'upload_date_desc',
    // Per-event promotional override (#440)
    promo_mode: ((event as { promo_mode?: 'inherit' | 'custom' | 'off' }).promo_mode) || 'inherit',
    info_mode: ((event as { info_mode?: 'inherit' | 'custom' | 'off' }).info_mode) || 'inherit',
    promo_markdown: (event as { promo_markdown?: string }).promo_markdown || '',
    info_markdown: (event as { info_markdown?: string }).info_markdown || '',
    // Customer accounts (#354). The backend returns
    // `customer_accounts: [{ id, email, display_name, ... }]`; map to
    // the picker's shape.
    // `groups` only comes with customers.view (#1443).
    customer_accounts: ((event as { customer_accounts?: Array<{ id: number; email: string; display_name?: string | null; groups?: CustomerGroup[] }> }).customer_accounts || [])
      .map((c) => ({ id: c.id, email: c.email, displayName: c.display_name ?? null, groups: c.groups })),
    // Per-event social-share opt-in (#474). Coerce explicitly so
    // SQLite's 0/1 and Postgres's true/false both render the switch
    // in the right state on first paint.
    og_image_share_enabled: event.og_image_share_enabled === true,
    // Client access (#1271), read the way ClientAccessCard reads it.
    client_access_enabled: !!(event as { client_access_enabled?: unknown }).client_access_enabled,
    client_password: '',
  };
}

/** The theme picker's state for a saved event (old handleStartEdit, theme half). */
export function themeValue(event: Event, brandingTheme: ThemeConfig | undefined): ThemeDraft {
  let config: ThemeConfig = GALLERY_THEME_PRESETS.default.config;
  let preset = 'default';
  if (event.color_theme) {
    try {
      if (event.color_theme.startsWith('{')) {
        config = JSON.parse(event.color_theme);
        const match = Object.entries(GALLERY_THEME_PRESETS)
          .find(([, p]) => JSON.stringify(p.config) === JSON.stringify(config));
        preset = match ? match[0] : 'custom';
      } else if (GALLERY_THEME_PRESETS[event.color_theme]) {
        config = GALLERY_THEME_PRESETS[event.color_theme].config;
        preset = event.color_theme;
      }
    } catch {
      config = GALLERY_THEME_PRESETS.default.config;
      preset = 'default';
    }
  } else if (brandingTheme) {
    // NULL = inherit Branding; shown as a custom look (#550 follow-up).
    config = brandingTheme;
    preset = 'custom';
  }
  // The header style card edits the stored columns, so show those.
  const stored = event as { header_style?: string | null; hero_divider_style?: string | null };
  return {
    config: {
      ...config,
      ...(stored.header_style ? { headerStyle: stored.header_style } : {}),
      ...(stored.hero_divider_style ? { heroDividerStyle: stored.hero_divider_style } : {}),
    } as ThemeConfig,
    preset,
  };
}
