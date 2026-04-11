const SCHEMA = 'v2';

exports.up = async function up(knex) {
  await knex.schema.withSchema(SCHEMA).createTable('export_jobs', (table) => {
    table.uuid('id').primary();
    table
      .uuid('prescription_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.prescriptions`)
      .onDelete('RESTRICT');
    table
      .uuid('doctor_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.doctors`)
      .onDelete('RESTRICT');
    table.text('idempotency_key').notNullable().unique();
    table.text('status').notNullable().defaultTo('queued');
    table.text('format').notNullable().defaultTo('json');
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable().defaultTo(5);
    table.timestamp('next_run_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.text('lease_owner');
    table.timestamp('lease_expires_at', { useTz: true });
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('failed_at', { useTz: true });
    table.text('last_error');
    table.jsonb('result_payload');
    table.text('result_content_type');
    table.text('result_file_name');
    table.timestamps(true, true);

    table.index(['status', 'next_run_at'], 'export_jobs_status_next_run_idx');
    table.index(['idempotency_key'], 'export_jobs_idempotency_idx');
    table.index(['doctor_id', 'created_at'], 'export_jobs_doctor_created_idx');
    table.index(['prescription_id', 'created_at'], 'export_jobs_prescription_created_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('export_jobs');
};
