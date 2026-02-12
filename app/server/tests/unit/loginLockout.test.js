const { LoginLockout } = require('../../src/core/auth/loginLockout');
const { buildTestEmail } = require('../helpers/testCredentials');

describe('Unit: LoginLockout', () => {
  it('evicts stale non-locked entries after the failure window', () => {
    let now = 0;
    const lockout = new LoginLockout({
      maxFailures: 3,
      lockoutMinutes: 15,
      windowMinutes: 15,
      now: () => now,
    });

    const staleEmail = buildTestEmail('stale');
    const activeEmail = buildTestEmail('active');

    lockout.registerFailure(staleEmail);

    now = 16 * 60 * 1000;
    lockout.registerFailure(activeEmail);

    expect(lockout._get(staleEmail)).toBeNull();
    expect(lockout._get(activeEmail)).toMatchObject({ count: 1 });
  });

  it('evicts expired lockouts during checks', () => {
    let now = 0;
    const lockout = new LoginLockout({
      maxFailures: 1,
      lockoutMinutes: 1,
      windowMinutes: 15,
      now: () => now,
    });

    const lockedEmail = buildTestEmail('locked');
    lockout.registerFailure(lockedEmail);
    expect(lockout.isLocked(lockedEmail)).toBe(true);

    now = 2 * 60 * 1000;
    expect(lockout.isLocked(lockedEmail)).toBe(false);
    expect(lockout._get(lockedEmail)).toBeNull();
  });
});
