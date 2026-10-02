/**
 * Gallery theming storage is dropped (client gallery redesign, 2026-10-01).
 * Brand colours used by the admin and the customer portal survive inside
 * app_settings.theme_config; everything gallery specific goes.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-263-secret-at-least-32-chars';

const knex = require('knex');
const { randomUUID } = require('crypto');
const migration = require('../../migrations/core/263_drop_gallery_theming');

// SQLite by default; PICPEAK_PG_TEST_URL runs it on Postgres in a scratch schema.
const pgUrl = process.env.PICPEAK_PG_TEST_URL;
let db; let cleanup; let owner; let schema;
beforeAll(async () => {
  if (pgUrl) {
    schema = `gallery_theming_${randomUUID().replace(/-/g, '')}`;
    owner = knex({ client: 'pg', connection: pgUrl });
    await owner.schema.createSchema(schema);
    process.env.DATABASE_CLIENT = 'pg';
    jest.doMock('../../knexfile', () => ({ client: 'pg', connection: pgUrl, searchPath: [schema] }));
  }
  const { bootCrmDb } = require('../integration/helpers/crmDb');
  ({ db, cleanup } = await bootCrmDb());
}, 120000);
afterAll(async () => {
  if (cleanup) await cleanup();
  if (owner) { await owner.schema.dropSchema(schema, true); await owner.destroy(); }
});

// SQLite hands setting_value back as text, Postgres (a json column) as an object.
const themeConfig = async () => {
  const { setting_value: value } = await db('app_settings').where({ setting_key: 'theme_config' }).first();
  return typeof value === 'string' ? JSON.parse(value) : value;
};

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

const BRAND = {
  primaryColor: '#123456', accentColor: '#abcdef', accentDarkColor: '#0a0a0a',
  backgroundColor: '#ffffff', surfaceColor: '#f5f5f5', elevatedColor: '#eeeeee',
  surfaceBorderColor: '#dddddd', textColor: '#111111', mutedTextColor: '#666666',
  colorMode: 'auto', forceColorMode: 'light', fontFamily: 'Inter',
  headingFontFamily: 'Lora', fontSize: 'normal', borderRadius: 'md',
  buttonStyle: 'pill', shadowStyle: 'subtle', logoUrl: '/uploads/logo.png',
};
const GALLERY = {
  galleryLayout: 'masonry', gallerySettings: { spacing: 'tight' },
  headerStyle: 'hero', heroDividerStyle: 'wave', controlsStyle: 'sidebar',
  customCss: '.x{}', backgroundPattern: 'dots', legacyHeaderStyle: 'standard',
  footerStyle: 'minimal', showEventInfo: true, showBranding: false, name: 'Elegant',
};

it('keeps brand keys and strips gallery keys from theme_config', async () => {
  await db('app_settings').insert({
    setting_key: 'theme_config', setting_value: JSON.stringify({ ...BRAND, ...GALLERY }), setting_type: 'theme',
  }).onConflict('setting_key').merge();

  await migration.up(db);

  expect(await themeConfig()).toEqual(BRAND);
});

it('converges when run again', async () => {
  const before = await themeConfig();
  await expect(migration.up(db)).resolves.not.toThrow();
  expect(await themeConfig()).toEqual(before);
});

it('handles a setting_value that is already a parsed object', async () => {
  const update = jest.fn().mockResolvedValue(1);
  const knex = jest.fn(() => ({
    where: () => ({ first: async () => ({ setting_value: { ...BRAND, ...GALLERY } }), update }),
  }));
  knex.schema = { hasTable: async () => true };

  await migration.stripThemeConfig(knex);

  expect(update).toHaveBeenCalledWith({ setting_value: JSON.stringify(BRAND) });
});

it('leaves an unparseable theme_config untouched and warns', async () => {
  const update = jest.fn();
  const knex = jest.fn(() => ({
    where: () => ({ first: async () => ({ setting_value: '{not json' }), update }),
  }));
  knex.schema = { hasTable: async () => true };
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  await migration.stripThemeConfig(knex);

  expect(update).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it('down recreates empty columns and the table, and up again keeps the brand keys', async () => {
  await migration.down(db);
  expect(await db.schema.hasColumn('events', 'color_theme')).toBe(true);
  expect(await db.schema.hasColumn('event_types', 'theme_config')).toBe(true);
  expect(await db.schema.hasTable('css_templates')).toBe(true);
  expect(await themeConfig()).toEqual(BRAND);

  await migration.up(db);
  expect(await db.schema.hasColumn('events', 'color_theme')).toBe(false);
  expect(await db.schema.hasTable('css_templates')).toBe(false);
  expect(await themeConfig()).toEqual(BRAND);
});
