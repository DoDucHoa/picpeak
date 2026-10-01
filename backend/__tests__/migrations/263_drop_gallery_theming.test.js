/**
 * Gallery theming storage is dropped (client gallery redesign, 2026-10-01).
 * Brand colours used by the admin and the customer portal survive inside
 * app_settings.theme_config; everything gallery specific goes.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-263-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/263_drop_gallery_theming');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

const themeRow = () => db('app_settings').where({ setting_key: 'theme_config' }).first();

it('drops the gallery theme columns from events', async () => {
  for (const column of ['color_theme', 'css_template_id', 'header_style', 'hero_divider_style']) {
    expect(await db.schema.hasColumn('events', column)).toBe(false);
  }
});

it('drops the theme columns from event_types', async () => {
  expect(await db.schema.hasColumn('event_types', 'theme_preset')).toBe(false);
  expect(await db.schema.hasColumn('event_types', 'theme_config')).toBe(false);
});

it('drops the css_templates table', async () => {
  expect(await db.schema.hasTable('css_templates')).toBe(false);
});

it('keeps brand keys and strips gallery keys from theme_config', async () => {
  const stored = {
    primaryColor: '#123456', accentColor: '#abcdef', backgroundColor: '#ffffff',
    textColor: '#111111', fontFamily: 'Inter', headingFontFamily: 'Lora',
    borderRadius: 'md', fontSize: 'normal', shadowStyle: 'subtle',
    forceColorMode: 'light', logoUrl: '/uploads/logo.png',
    galleryLayout: 'masonry', gallerySettings: { spacing: 'tight' },
    headerStyle: 'hero', heroDividerStyle: 'wave', controlsStyle: 'sidebar',
    customCss: '.x{}', backgroundPattern: 'dots', name: 'Elegant',
  };
  await db('app_settings').insert({
    setting_key: 'theme_config', setting_value: JSON.stringify(stored), setting_type: 'theme',
  }).onConflict('setting_key').merge();

  await migration.up(db);

  const kept = JSON.parse((await themeRow()).setting_value);
  expect(kept).toEqual({
    primaryColor: '#123456', accentColor: '#abcdef', backgroundColor: '#ffffff',
    textColor: '#111111', fontFamily: 'Inter', headingFontFamily: 'Lora',
    borderRadius: 'md', fontSize: 'normal', shadowStyle: 'subtle',
    forceColorMode: 'light', logoUrl: '/uploads/logo.png',
  });
});

it('converges when run again', async () => {
  await expect(migration.up(db)).resolves.not.toThrow();
});

it('down recreates empty columns and the table', async () => {
  await migration.down(db);
  expect(await db.schema.hasColumn('events', 'color_theme')).toBe(true);
  expect(await db.schema.hasColumn('event_types', 'theme_config')).toBe(true);
  expect(await db.schema.hasTable('css_templates')).toBe(true);
  await migration.up(db);
});
