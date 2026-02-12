const SCHEMA = 'v2';

exports.up = async function (knex) {
  await knex.schema.withSchema(SCHEMA).alterTable('audit_events', (table) => {
    table.text('redaction_mode');
    table.index(['event_type', 'created_at']);
    table.index(['actor_user_id', 'created_at']);
    table.index(['subject_id', 'created_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.withSchema(SCHEMA).alterTable('audit_events', (table) => {
    table.dropIndex(['event_type', 'created_at']);
    table.dropIndex(['actor_user_id', 'created_at']);
    table.dropIndex(['subject_id', 'created_at']);
    table.dropColumn('redaction_mode');
  });
};
