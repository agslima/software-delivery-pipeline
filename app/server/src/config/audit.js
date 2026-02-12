const env = require('./env');

const config = {
  enabled: true,
  sink: env.AUDIT_SINK || 'db',
  piiRedaction: env.AUDIT_PII_REDACTION || 'none',
};

module.exports = config;
