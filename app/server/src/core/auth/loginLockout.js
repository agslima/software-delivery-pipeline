class LoginLockout {
  constructor({
    maxFailures = 5,
    lockoutMinutes = 15,
    windowMinutes = 15,
    now = () => Date.now(),
  } = {}) {
    this.maxFailures = maxFailures;
    this.lockoutMs = lockoutMinutes * 60 * 1000;
    this.windowMs = windowMinutes * 60 * 1000;
    this.now = now;
    this.store = new Map();
  }

  _get(key) {
    if (!key) return null;
    return this.store.get(key) || null;
  }

  _evictStaleEntries(now) {
    for (const [storedKey, entry] of this.store.entries()) {
      if (entry.lockedUntil && now < entry.lockedUntil) {
        continue;
      }

      if (entry.lockedUntil && now >= entry.lockedUntil) {
        this.store.delete(storedKey);
        continue;
      }

      if (now - entry.firstFailureAt > this.windowMs) {
        this.store.delete(storedKey);
      }
    }
  }

  isLocked(key) {
    this._evictStaleEntries(this.now());
    const entry = this._get(key);
    if (!entry || !entry.lockedUntil) return false;
    if (this.now() < entry.lockedUntil) return true;
    this.store.delete(key);
    return false;
  }

  registerFailure(key) {
    if (!key) return;
    const now = this.now();
    this._evictStaleEntries(now);
    const entry = this._get(key);

    if (!entry || now - entry.firstFailureAt > this.windowMs) {
      const lockedUntil = this.maxFailures <= 1 ? now + this.lockoutMs : null;
      this.store.set(key, { count: 1, firstFailureAt: now, lockedUntil });
      return;
    }

    const nextCount = entry.count + 1;
    const lockedUntil = nextCount >= this.maxFailures ? now + this.lockoutMs : null;
    this.store.set(key, {
      count: nextCount,
      firstFailureAt: entry.firstFailureAt,
      lockedUntil,
    });
  }

  registerSuccess(key) {
    if (!key) return;
    this.store.delete(key);
  }
}

module.exports = { LoginLockout };
