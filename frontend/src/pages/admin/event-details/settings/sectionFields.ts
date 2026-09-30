/**
 * Every editable field and the one section that edits it (spec 5.1, "every
 * setting has exactly one place"). Keys are draft keys: "<part>.<field>".
 * The inventory test (Task 15) holds the page to this list.
 */
export type SectionId = 'details' | 'access' | 'appearance' | 'guests' | 'downloads' | 'advanced' | 'extra';

export const SECTION_ORDER: SectionId[] = ['details', 'access', 'appearance', 'guests', 'downloads', 'advanced', 'extra'];

const FEEDBACK = [
  'feedback_enabled', 'allow_ratings', 'allow_likes', 'allow_comments', 'allow_favorites', 'allow_reactions',
  'allow_color_labels', 'require_name_email', 'moderate_comments', 'show_feedback_to_guests', 'keybind_mode',
  'identity_mode', 'max_favorites_per_guest', 'max_likes_per_guest',
].map((f) => `feedback.${f}`);

export const SECTION_FIELDS: Record<SectionId, string[]> = {
  details: ['customer_name', 'customer_email', 'customer_phone', 'customer_accounts', 'expires_at', 'welcome_message'].map((f) => `event.${f}`),
  access: ['require_password', 'new_password', 'confirm_new_password', 'client_access_enabled', 'client_password'].map((f) => `event.${f}`),
  appearance: [
    '__theme', 'css_template_id', 'hero_photo_id', 'og_image_share_enabled', 'hero_image_anchor', 'hero_logo_visible',
    'hero_logo_size', 'hero_logo_position', 'login_logo_visible', 'promo_mode', 'promo_markdown', 'info_mode', 'info_markdown',
  ].map((f) => `event.${f}`),
  guests: ['event.show_credits_to_guests', ...FEEDBACK],
  downloads: [
    'event.allow_downloads', 'quota.quota_enabled', 'quota.auto_approve', 'quota.free_limit', 'quota.price_per_photo',
    'resolution.download_standard_resolution', 'resolution.download_resolution_picker_enabled', 'resolution.download_allow_original',
  ],
  advanced: ['source_mode', 'external_path', 'external_watch', 'photo_cap', 'default_photo_sort'].map((f) => `event.${f}`),
  extra: [],
};

/** In the form state but edited nowhere: no UI (protection_level) or replaced by the theme draft (color_theme). */
export const NOT_EDITABLE = ['event.protection_level', 'event.color_theme'];

export function sectionOf(key: string): SectionId | null {
  return SECTION_ORDER.find((id) => SECTION_FIELDS[id].includes(key)) ?? null;
}
