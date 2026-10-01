/**
 * Hero logo position and the logo on the gallery password page become
 * Branding settings for every gallery (P3 of the event form redesign, spec
 * 5.10). Both start at the value every event had by default: the logo at the
 * top, and shown on the password page. The hero logo size already has a
 * Branding value, branding_logo_size, shared with the header logo.
 *
 * The per-event columns keep their values and are no longer read.
 */
const SEEDS = [
  { setting_key: 'branding_hero_logo_position', value: 'top' },
  { setting_key: 'branding_gallery_password_logo_visible', value: true },
];

exports.up = async function up(knex) {
  for (const { setting_key, value } of SEEDS) {
    const existing = await knex('app_settings').where({ setting_key }).first();
    if (!existing) {
      await knex('app_settings').insert({
        setting_key,
        setting_value: JSON.stringify(value),
        setting_type: 'branding',
        updated_at: new Date(),
      });
    }
  }
};

exports.down = async function down(knex) {
  await knex('app_settings').whereIn('setting_key', SEEDS.map((s) => s.setting_key)).delete();
};
