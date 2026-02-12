const SCHEMA = 'v2';

exports.up = async function (knex) {
  await knex.schema.withSchema(SCHEMA).createTable('refresh_tokens', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.users`)
      .onDelete('RESTRICT');
    table.text('token_hash').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('revoked_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.unique(['token_hash']);
  });
};

exports.down = async function (knex) {
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('refresh_tokens');
};
