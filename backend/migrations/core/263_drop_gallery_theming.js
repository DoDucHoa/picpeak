/**
 * Drop gallery theming storage (client gallery redesign, 2026-10-01).
 *
 * Every gallery now renders one fixed design, so per-event themes, header
 * and divider styles, CSS templates and per-event-type presets have no
 * reader left. Brand colours, fonts and the logo inside theme_config still
 * style the admin and the customer portal, so that row is rewritten rather
 * than dropped.
 *
 * Every step is guarded so a partly migrated install converges. down()
 * recreates the structures EMPTY: the dropped values come back only from a
 * database backup.
 */
const BRAND_KEYS = [
  'primaryColor', 'accentColor', 'accentDarkColor', 'backgroundColor',
  'surfaceColor', 'elevatedColor', 'surfaceBorderColor', 'textColor',
  'mutedTextColor', 'colorMode', 'forceColorMode', 'fontFamily',
  'headingFontFamily', 'fontSize', 'borderRadius', 'buttonStyle',
  'shadowStyle', 'logoUrl',
];

const EVENT_COLUMNS = ['color_theme', 'css_template_id', 'header_style', 'hero_divider_style'];
const EVENT_TYPE_COLUMNS = ['theme_preset', 'theme_config'];

async function dropColumns(knex, table, columns) {
  if (!(await knex.schema.hasTable(table))) return;
  for (const column of columns) {
    if (await knex.schema.hasColumn(table, column)) {
      await knex.schema.alterTable(table, (t) => t.dropColumn(column));
    }
  }
}

async function stripThemeConfig(knex) {
  if (!(await knex.schema.hasTable('app_settings'))) return;
  const row = await knex('app_settings').where({ setting_key: 'theme_config' }).first();
  if (!row || !row.setting_value) return;
  let parsed;
  try {
    parsed = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
  } catch (err) {
    console.warn(`[Migration 263] Could not parse app_settings.theme_config, left as is: ${err.message}`);
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const kept = {};
  for (const key of BRAND_KEYS) {
    if (parsed[key] !== undefined) kept[key] = parsed[key];
  }
  await knex('app_settings').where({ setting_key: 'theme_config' })
    .update({ setting_value: JSON.stringify(kept) });
}

exports.stripThemeConfig = stripThemeConfig;

exports.up = async function up(knex) {
  // The foreign key column goes before the table it points at.
  await dropColumns(knex, 'events', EVENT_COLUMNS);
  await dropColumns(knex, 'event_types', EVENT_TYPE_COLUMNS);
  if (await knex.schema.hasTable('css_templates')) {
    await knex.schema.dropTable('css_templates');
  }
  await stripThemeConfig(knex);
};

exports.down = async function down(knex) {
  // Column types follow migrations 052 (css_templates), 061 (event_types)
  // and 065 (header styles). The table goes back before the column that
  // references it. No seeded templates are reinserted.
  if (!(await knex.schema.hasTable('css_templates'))) {
    await knex.schema.createTable('css_templates', (table) => {
      table.increments('id').primary();
      table.integer('slot_number').notNullable();
      table.string('name', 50).notNullable().defaultTo('Untitled');
      table.text('css_content').notNullable().defaultTo('');
      table.boolean('is_enabled').notNullable().defaultTo(false);
      table.boolean('is_default').notNullable().defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique('slot_number');
    });
  }

  if (await knex.schema.hasTable('events')) {
    if (!(await knex.schema.hasColumn('events', 'css_template_id'))) {
      await knex.schema.alterTable('events', (table) => {
        table.integer('css_template_id').references('id').inTable('css_templates').onDelete('SET NULL');
      });
    }
    if (!(await knex.schema.hasColumn('events', 'color_theme'))) {
      await knex.schema.alterTable('events', (table) => {
        table.text('color_theme');
      });
    }
    if (!(await knex.schema.hasColumn('events', 'header_style'))) {
      await knex.schema.alterTable('events', (table) => {
        table.string('header_style', 20).defaultTo('standard');
      });
    }
    if (!(await knex.schema.hasColumn('events', 'hero_divider_style'))) {
      await knex.schema.alterTable('events', (table) => {
        table.string('hero_divider_style', 20).defaultTo('wave');
      });
    }
  }

  if (await knex.schema.hasTable('event_types')) {
    if (!(await knex.schema.hasColumn('event_types', 'theme_preset'))) {
      await knex.schema.alterTable('event_types', (table) => {
        table.string('theme_preset', 50);
      });
    }
    if (!(await knex.schema.hasColumn('event_types', 'theme_config'))) {
      await knex.schema.alterTable('event_types', (table) => {
        table.text('theme_config');
      });
    }
  }
};
