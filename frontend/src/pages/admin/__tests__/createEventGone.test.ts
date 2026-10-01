/**
 * Gone from create (spec 3, 5.5): the confirm password field, the theme
 * customizer, the CSS template and the guest upload controls.
 */
import fs from 'fs';
import path from 'path';
import { expect, it } from 'vitest';
import { createSources } from './createSources';

it('the create screen carries none of the removed controls', () => {
  expect(createSources()).not.toMatch(/confirm_password|ThemeCustomizerEnhanced|GalleryPreview|css_template_id|allow_user_uploads|upload_category/);
});

it('the create screen is built from the shared fields', () => {
  const src = createSources();
  for (const component of ['CustomerFields', 'PasswordField', 'ExpiryField', 'PhotoSourceFields', 'FeedbackModeSelector', 'IdentityModeField', 'WelcomeMessageEditor']) {
    expect(src).toMatch(new RegExp(`<${component}\\b`));
  }
  expect(fs.existsSync(path.resolve(__dirname, '../create-event/CreateEventForm.tsx'))).toBe(true);
});
