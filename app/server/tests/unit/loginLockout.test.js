const { LoginLockout } = require('../../src/core/auth/loginLockout');

describe('Unit: LoginLockout', () => {
  it('evicts stale non-locked entries after the failure window', () => {
    let now = 0;
    const lockout = new LoginLockout({
      maxFailures: 3,
      lockoutMinutes: 15,
      windowMinutes: 15,
      now: () => now,
    });

    lockout.registerFailure('stale@example.com');

    now = 16 * 60 * 1000;
    lockout.registerFailure('active@example.com');

    expect(lockout._get('stale@example.com')).toBeNull();
    expect(lockout._get('active@example.com')).toMatchObject({ count: 1 });
  });

  it('evicts expired lockouts during checks', () => {
    let now = 0;
    const lockout = new LoginLockout({
      maxFailures: 1,
      lockoutMinutes: 1,
      windowMinutes: 15,
      now: () => now,
    });

    lockout.registerFailure('locked@example.com');
    expect(lockout.isLocked('locked@example.com')).toBe(true);

    now = 2 * 60 * 1000;
    expect(lockout.isLocked('locked@example.com')).toBe(false);
    expect(lockout._get('locked@example.com')).toBeNull();
  });
});
