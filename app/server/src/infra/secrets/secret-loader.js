'use strict';

const fs = require('fs');

const cache = new Map();

/**
 * Hook these into your observability system
 * (reuse your existing metrics module)
 */
let metrics = {
  observeSecretLoad: () => {},
  incrementSecretError: () => {},
};

/**
 * Allow dependency injection (clean + testable)
 */
const configureSecretMetrics = (customMetrics) => {
  metrics = { ...metrics, ...customMetrics };
};

/**
 * Safe file read with observability
 */
const readFileSafe = (path) => {
  const start = Date.now();

  try {
    const value = fs.readFileSync(path, 'utf8').trim();

    if (!value) {
      throw new Error('Secret file is empty');
    }

    metrics.observeSecretLoad({
      source: 'file',
      path,
      status: 'success',
      durationMs: Date.now() - start,
    });

    return value;
  } catch (err) {
    metrics.incrementSecretError({
      source: 'file',
      path,
      reason: err.message,
    });

    throw new Error(`Failed to read secret file at ${path}: ${err.message}`);
  }
};

/**
 * Resolve secret with strict priority:
 *
 * 1. ENV_VAR_FILE
 * 2. /run/secrets/<name>
 * 3. ENV_VAR
 *
 * Always fail if not found.
 */
const resolveSecret = (secretName, envVar) => {
  const cacheKey = `${secretName}:${envVar}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const start = Date.now();

  try {
    let value;

    // 1. Explicit file via env
    const fileFromEnv = process.env[`${envVar}_FILE`];
    if (fileFromEnv) {
      value = readFileSafe(fileFromEnv);
      cache.set(cacheKey, value);
      return value;
    }

    // 2. Docker secrets
    const dockerSecretPath = `/run/secrets/${secretName}`;
    if (fs.existsSync(dockerSecretPath)) {
      value = readFileSafe(dockerSecretPath);
      cache.set(cacheKey, value);
      return value;
    }

    // 3. Plain env fallback
    if (process.env[envVar]) {
      value = String(process.env[envVar]).trim();

      metrics.observeSecretLoad({
        source: 'env',
        envVar,
        status: 'success',
        durationMs: Date.now() - start,
      });

      cache.set(cacheKey, value);
      return value;
    }

    throw new Error('Secret not found in any source');
  } catch (err) {
    metrics.incrementSecretError({
      secretName,
      envVar,
      reason: err.message,
    });

    throw new Error(
      `Secret resolution failed for "${secretName}" (${envVar}): ${err.message}`
    );
  }
};

/**
 * Optional: preload critical secrets at startup
 */
const preloadSecrets = (definitions = []) => {
  definitions.forEach(({ secretName, envVar }) => {
    resolveSecret(secretName, envVar);
  });
};

/**
 * Optional: clear cache (useful for tests / rotation)
 */
const clearSecretCache = () => {
  cache.clear();
};

module.exports = {
  resolveSecret,
  preloadSecrets,
  clearSecretCache,
  configureSecretMetrics,
};
