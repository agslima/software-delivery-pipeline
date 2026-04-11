const knex = require('knex');
const { createKnexConfig } = require('./knex-config');

/* eslint-disable no-console */

const command = process.argv[2] || 'latest';
const rollbackAll = process.argv.includes('--all');

const toMigrationName = (entry) => {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    if (typeof entry.name === 'string') return entry.name;
    if (typeof entry.file === 'string') return entry.file;
  }

  return String(entry);
};

const formatMigrationNames = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'none';
  }

  return entries.map(toMigrationName).join(', ');
};

const main = async () => {
  const db = knex(
    createKnexConfig({
      pool: { min: 0, max: 2 },
    })
  );

  try {
    switch (command) {
      case 'latest': {
        const [batchNo, migrations] = await db.migrate.latest();
        console.log(`Applied migration batch ${batchNo}: ${formatMigrationNames(migrations)}`);
        break;
      }
      case 'seed': {
        const [seeds] = await db.seed.run();
        console.log(`Executed seeds: ${formatMigrationNames(seeds)}`);
        break;
      }
      case 'bootstrap': {
        const [batchNo, migrations] = await db.migrate.latest();
        const [seeds] = await db.seed.run();
        console.log(`Applied migration batch ${batchNo}: ${formatMigrationNames(migrations)}`);
        console.log(`Executed seeds: ${formatMigrationNames(seeds)}`);
        break;
      }
      case 'status': {
        const [completed, pending] = await db.migrate.list();
        console.log(`Completed migrations (${completed.length}): ${formatMigrationNames(completed)}`);
        console.log(`Pending migrations (${pending.length}): ${formatMigrationNames(pending)}`);
        break;
      }
      case 'rollback': {
        const [batchNo, migrations] = await db.migrate.rollback(undefined, rollbackAll);
        console.log(`Rolled back migration batch ${batchNo}: ${formatMigrationNames(migrations)}`);
        break;
      }
      default:
        throw new Error(`Unsupported migration command "${command}". Use latest, seed, bootstrap, status, or rollback.`);
    }
  } finally {
    await db.destroy();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration runner failed: ${message}`);
  process.exitCode = 1;
});
