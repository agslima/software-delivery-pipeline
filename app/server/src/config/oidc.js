const env = require('./env');

const enabled = env.OIDC_ENABLED;
const required = env.OIDC_REQUIRED;

const config = {
  enabled,
  required,
  issuer: env.OIDC_ISSUER || null,
  audience: env.OIDC_AUDIENCE || null,
  jwksUri: env.OIDC_JWKS_URI || null,
  emailClaim: env.OIDC_EMAIL_CLAIM || 'email',
  roleClaim: env.OIDC_ROLE_CLAIM || 'roles',
  mfaRequiredRoles: env.OIDC_MFA_REQUIRED_ROLES || 'doctor,admin',
  requiredAmr: env.OIDC_REQUIRED_AMR || 'mfa',
  requiredAcr: env.OIDC_REQUIRED_ACR || '',
  clockToleranceSeconds: env.OIDC_CLOCK_TOLERANCE_SECONDS || 5,
};

module.exports = config;
