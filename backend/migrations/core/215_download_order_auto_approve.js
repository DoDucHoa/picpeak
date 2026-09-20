'use strict';

/**
 * Migration 215: per-event auto-approve for download quota orders.
 *
 * When on, a new order settles as 'approved' the moment it is placed instead
 * of waiting for a human. Existing pending orders are never touched by this
 * column: only createOrder() reads it, and only at insert time.
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('event_download_quota_settings', 'auto_approve');
  if (!hasColumn) {
    await knex.schema.alterTable('event_download_quota_settings', (table) => {
      table.boolean('auto_approve').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('event_download_quota_settings', 'auto_approve');
  if (hasColumn) {
    await knex.schema.alterTable('event_download_quota_settings', (table) => {
      table.dropColumn('auto_approve');
    });
  }
};
