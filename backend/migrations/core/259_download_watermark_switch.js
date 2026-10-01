/**
 * Downloaded files are watermarked only when this switch is on (P0 of the
 * event form redesign). Before it, a download was watermarked whenever the
 * gallery view watermark or the event's own flag was on, so the switch
 * starts off: downloads come out clean.
 *
 * Every pre-built guest zip is forgotten because it may have been built
 * under the old rule. The service rebuilds each on demand; getZipInfo trusts
 * only this pointer, so clearing it is enough.
 */
exports.up = async function up(knex) {
  const existing = await knex('app_settings')
    .where({ setting_key: 'branding_watermark_downloads_enabled' })
    .first();
  if (!existing) {
    await knex('app_settings').insert({
      setting_key: 'branding_watermark_downloads_enabled',
      setting_value: JSON.stringify(false),
      setting_type: 'branding',
      updated_at: new Date(),
    });
  }
  if (await knex.schema.hasColumn('events', 'download_zip_path')) {
    await knex('events')
      .whereNotNull('download_zip_path')
      .update({ download_zip_path: null, download_zip_generated_at: null });
  }
};

exports.down = async function down(knex) {
  await knex('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).delete();
};
