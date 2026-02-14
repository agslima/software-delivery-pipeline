const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const readSecret = (secretName, envVar) => {
  const secretPath = `/run/secrets/${secretName}`;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(secretPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch {
    // Ignore secret file access errors and fallback to environment variable.
  }

  return process.env[envVar];
};

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: readSecret('db_pass', 'DB_PASS'),
    database: process.env.DB_NAME,
  },
  migrations: { directory: path.join(__dirname, '../infra/db/migrations') },
  seeds: { directory: path.join(__dirname, '../infra/db/seeds') },
};
