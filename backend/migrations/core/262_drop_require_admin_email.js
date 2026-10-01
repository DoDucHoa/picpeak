/**
 * "Require admin email" is removed (P3 of the event form redesign, spec
 * 5.10): one global notification email decides where admin mail about a
 * gallery goes, so an event no longer needs its own address. The setting is
 * read by nothing any more and its row goes; down restores the seed of
 * migration 050.
 */
exports.up = async function up(knex) {
  await knex('app_settings').where({ setting_key: 'event_require_admin_email' }).delete();
};

exports.down = async function down(knex) {
  const existing = await knex('app_settings').where({ setting_key: 'event_require_admin_email' }).first();
  if (!existing) {
    await knex('app_settings').insert({
      setting_key: 'event_require_admin_email', setting_value: JSON.stringify(true), setting_type: 'boolean',
    });
  }
};
