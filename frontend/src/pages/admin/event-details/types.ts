import type { ThemeConfig } from '../../../types/theme.types';

export type EventDetailsTab = 'overview' | 'photos' | 'categories' | 'guests' | 'downloads' | 'settings';

export type EditFormState = {
  welcome_message: string;
  color_theme: string;
  css_template_id: number | null;
  expires_at: string;
  // Photo credits (#1561)
  show_credits_to_guests: boolean;
  hero_photo_id: number | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  source_mode: 'managed' | 'reference';
  external_path: string;
  external_watch: boolean;
  require_password: boolean;
  new_password: string;
  confirm_new_password: string;
  // Download protection settings
  protection_level: 'basic' | 'standard' | 'enhanced' | 'maximum';
  allow_downloads: boolean;
  // Hero logo settings. null = inherit the global branding toggle (#756).
  hero_logo_visible: boolean | null;
  hero_logo_size: 'small' | 'medium' | 'large' | 'xlarge' | null;
  hero_logo_position: 'top' | 'center' | 'bottom';
  // #894: null = default (show); false hides the logo on the password page.
  login_logo_visible: boolean | null;
  // Hero image anchor position (#162) – keyword or "X% Y%" focal point
  hero_image_anchor: string;
  // Photo cap
  photo_cap: number;
  // Default photo sort
  default_photo_sort: string;
  // Per-event promotional override (#440). Three-way mode:
  //   inherit → use the global branding_promo_markdown
  //   custom  → render this event's promo_markdown
  //   off     → no promo for this event regardless of global
  promo_mode: 'inherit' | 'custom' | 'off';
  promo_markdown: string;
  // Info banner (#932) — same three-way mode, rendered above the grid.
  info_mode: 'inherit' | 'custom' | 'off';
  info_markdown: string;
  // Customer accounts assigned to this event (#354). Hydrated from
  // the GET /admin/events/:id response and sent back as a flat id
  // array on save.
  customer_accounts: Array<{ id: number; email: string; displayName: string | null }>;
  // Per-event opt-in for hero photo as social-share preview (#474).
  og_image_share_enabled: boolean;
  // Client access (#1271), edited in Settings > Access and saved by the bar.
  client_access_enabled: boolean;
  client_password: string;
};

/** The theme picker's state in the draft: the look and the preset it came from. */
export interface ThemeDraft { config: ThemeConfig; preset: string }

export const INITIAL_EDIT_FORM: EditFormState = {
  welcome_message: '',
  color_theme: '',
  css_template_id: null,
  expires_at: '',
  show_credits_to_guests: false,
  hero_photo_id: null,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  source_mode: 'managed',
  external_path: '',
  external_watch: false,
  require_password: true,
  new_password: '',
  confirm_new_password: '',
  // Download protection settings
  protection_level: 'standard',
  allow_downloads: true,
  // Hero logo settings — null = inherit global branding toggle (#756)
  hero_logo_visible: null,
  hero_logo_size: null,
  hero_logo_position: 'top',
  login_logo_visible: null,
  // Hero image anchor position (#162)
  hero_image_anchor: 'center',
  // Photo cap
  photo_cap: 0,
  // Default photo sort
  default_photo_sort: 'upload_date_desc',
  // Per-event promotional override (#440)
  promo_mode: 'inherit',
  promo_markdown: '',
  info_mode: 'inherit',
  info_markdown: '',
  // Customer accounts (#354) — hydrated from event response.
  customer_accounts: [],
  // Per-event social-share opt-in (#474). Default false everywhere
  // so a freshly opened editor never displays "on" against the saved
  // (off) state.
  og_image_share_enabled: false,
  client_access_enabled: false,
  client_password: '',
};
