exports.up = function(knex) {
  return knex.schema.createTable('prescriptions', (table) => {
    table.string('id').primary(); 
    table.string('clinic_name').notNullable();
    table.string('date').notNullable();
    
    // Storing complex nested data as JSONB (Postgres feature)
    table.jsonb('doctor').notNullable();
    table.jsonb('patient').notNullable();
    table.jsonb('medications').notNullable(); // Array of meds

    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('prescriptions');
};