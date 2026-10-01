/**
 * The instance brand: what the admin, the customer portal and the public
 * pages are painted with. The client gallery has one fixed look of its own
 * (features/client-gallery/galleryTokens.css) and reads none of this.
 *
 * Matches the keys the backend keeps in theme_config (migration 263), minus
 * forceColorMode, which is a separate setting handed to applyForceColorMode.
 */
export interface BrandTheme {
  // Colors: 8-token CI palette.
  // Naming kept for backward-compat with existing settings rows; semantics:
  //   backgroundColor    page base
  //   surfaceColor       cards, nav, alternating sections
  //   elevatedColor      raised panels, image placeholders
  //   surfaceBorderColor dividers, borders, grid lines (a.k.a. "border" token)
  //   textColor          primary text (Text 1)
  //   mutedTextColor     secondary text (Text 2)
  //   accentColor        links, icons, focus rings, hover
  //   accentDarkColor    primary CTA fill, filled states
  //
  // primaryColor is retained as a legacy alias; the Branding page keeps it
  // equal to accentDarkColor. Do not surface it in new UI.
  primaryColor?: string;
  accentColor?: string;
  accentDarkColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  elevatedColor?: string;
  surfaceBorderColor?: string;
  textColor?: string;
  mutedTextColor?: string;

  // Color Mode
  colorMode?: 'light' | 'dark' | 'auto';

  // Typography
  fontFamily?: string;
  headingFontFamily?: string;
  fontSize?: 'small' | 'normal' | 'large';

  // Styling
  borderRadius?: 'none' | 'sm' | 'md' | 'lg';
  buttonStyle?: 'solid' | 'outline' | 'ghost';
  shadowStyle?: 'none' | 'subtle' | 'normal' | 'dramatic';

  logoUrl?: string;
}
