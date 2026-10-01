/**
 * Right-click blocking becomes one switch for every gallery (P1 of the
 * event form redesign), next to devtools detection and canvas rendering in
 * Image security. It starts on, the value new events have always had.
 *
 * The two creation defaults migration 037 seeded are read by nothing and
 * go: right-click is now this global switch, and download watermarks are
 * the Branding switch from migration 259.
 */
exports.up = async function up(knex) {
  const existing = await knex('app_settings').where({ setting_key: 'disable_right_click' }).first();
  if (!existing) {
    await knex('app_settings').insert({
      setting_key: 'disable_right_click',
      setting_value: JSON.stringify(true),
      setting_type: 'security',
      updated_at: new Date(),
    });
  }
  await knex('app_settings')
    .whereIn('setting_key', ['default_disable_right_click', 'default_watermark_downloads'])
    .delete();
};

exports.down = async function down(knex) {
  await knex('app_settings').where({ setting_key: 'disable_right_click' }).delete();
  for (const key of ['default_disable_right_click', 'default_watermark_downloads']) {
    const row = await knex('app_settings').where({ setting_key: key }).first();
    if (!row) {
      await knex('app_settings').insert({
        setting_key: key, setting_value: JSON.stringify(false), setting_type: 'gallery',
      });
    }
  }
};
