/**
 * Migration 214: Download quota + paid packages.
 *
 * A gallery gets a free download allowance. Once it is used up the client buys
 * more in packages; the photographer approves the order and only then does the
 * allowance grow.
 *
 * `event_photo_downloads.photo_id` has NO foreign key ON PURPOSE. Every other
 * table carrying photo_id cascades on photo delete; here that would refund the
 * slot when the photographer removes a photo, which contradicts the agreed rule
 * that deleting a photo never refunds a slot. Do not "fix" this by adding the
 * FK, and do NOT add this table to externalPhotoDedupe's photo_id cleanup list:
 * the row has to outlive the photo it refers to.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('event_download_quota_settings'))) {
    await knex.schema.createTable('event_download_quota_settings', (table) => {
      table.increments('id').primary();
      table.integer('event_id').references('id').inTable('events').onDelete('CASCADE');
      table.boolean('quota_enabled').defaultTo(false);
      table.timestamp('enabled_at').nullable();
      // NULL means "inherit the system default". Zero is a different statement:
      // it means this gallery grants no free download at all.
      table.integer('free_limit').nullable();
      table.decimal('price_per_photo', 10, 2).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['event_id']);
    });
  }

  if (!(await knex.schema.hasTable('download_packages'))) {
    await knex.schema.createTable('download_packages', (table) => {
      table.increments('id').primary();
      // NULL event_id is the global price list. Per-event rows REPLACE the
      // global list rather than merging with it, so a gallery can drop a
      // package the global list offers.
      table.integer('event_id').nullable().references('id').inTable('events').onDelete('CASCADE');
      table.string('kind', 20).notNullable().defaultTo('quantity');
      table.integer('photo_count').nullable();
      table.decimal('price', 10, 2).notNullable();
      table.jsonb('name_i18n').nullable();
      table.integer('sort_order').defaultTo(0);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['event_id', 'is_active', 'sort_order'], 'download_packages_scope_idx');
    });
  }

  if (!(await knex.schema.hasTable('event_photo_downloads'))) {
    await knex.schema.createTable('event_photo_downloads', (table) => {
      table.increments('id').primary();
      table.integer('event_id').references('id').inTable('events').onDelete('CASCADE');
      // No FK on photo_id. See the header comment before changing this.
      table.integer('photo_id').notNullable();
      table.timestamp('first_downloaded_at').defaultTo(knex.fn.now());
      table.string('access_level', 20).nullable();
      table.jsonb('actor').nullable();
      table.unique(['event_id', 'photo_id']);
      table.index(['event_id'], 'event_photo_downloads_event_idx');
    });
  }

  if (!(await knex.schema.hasTable('download_quota_orders'))) {
    await knex.schema.createTable('download_quota_orders', (table) => {
      table.increments('id').primary();
      table.integer('event_id').references('id').inTable('events').onDelete('CASCADE');
      table.integer('package_id').nullable().references('id').inTable('download_packages').onDelete('SET NULL');
      // Frozen copy of the package as it was when the order was placed, so a
      // later price edit never rewrites the history of what was agreed.
      table.jsonb('package_snapshot').nullable();
      table.integer('requested_photo_count').nullable();
      table.integer('granted_photo_count').nullable();
      table.boolean('grants_unlimited').defaultTo(false);
      table.string('status', 20).notNullable().defaultTo('pending');
      table.string('origin', 20).notNullable().defaultTo('client');
      table.text('reason').nullable();
      table.jsonb('actor').nullable();
      table.integer('approved_by').nullable().references('id').inTable('admin_users').onDelete('SET NULL');
      table.timestamp('approved_at').nullable();
      table.timestamp('expires_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['status', 'expires_at'], 'download_quota_orders_status_idx');
    });
  }

  // One pending order per gallery, enforced by the database rather than by a
  // read-then-insert check in code: that check always leaves a race window, and
  // two orders arriving together is exactly the case that would slip through.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS download_quota_orders_one_pending
      ON download_quota_orders (event_id) WHERE status = 'pending'
  `);

  const defaults = [
    ['download_quota_default_enabled', false],
    ['download_quota_default_free_limit', 20],
    ['download_quota_default_price_per_photo', 1.0],
    ['download_quota_order_expiry_days', 14],
  ];
  for (const [key, value] of defaults) {
    const exists = await knex('app_settings').where('setting_key', key).first();
    if (!exists) {
      await knex('app_settings').insert({
        setting_key: key,
        setting_value: JSON.stringify(value),
        setting_type: 'gallery',
      });
    }
  }
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS download_quota_orders_one_pending');
  await knex.schema.dropTableIfExists('download_quota_orders');
  await knex.schema.dropTableIfExists('event_photo_downloads');
  await knex.schema.dropTableIfExists('download_packages');
  await knex.schema.dropTableIfExists('event_download_quota_settings');
  await knex('app_settings').whereIn('setting_key', [
    'download_quota_default_enabled',
    'download_quota_default_free_limit',
    'download_quota_default_price_per_photo',
    'download_quota_order_expiry_days',
  ]).delete();
};
