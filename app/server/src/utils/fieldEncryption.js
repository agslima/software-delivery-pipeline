const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc::';

const deriveKey = (input) => crypto.createHash('sha256').update(String(input)).digest();

const parseKeyPairs = (input) =>
  String(input || '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [keyId, ...rest] = pair.split(':');
      const secret = rest.join(':');
      return { keyId: keyId?.trim(), secret: secret?.trim() };
    })
    .filter((entry) => entry.keyId && entry.secret);

const buildKeyring = () => {
  const keyring = new Map();
  const pairs = parseKeyPairs(env.DATA_ENCRYPTION_KEYS);

  pairs.forEach(({ keyId, secret }) => {
    if (!keyring.has(keyId)) {
      keyring.set(keyId, deriveKey(secret));
    }
  });

  const primaryId = env.DATA_ENCRYPTION_KEY_ID || 'v1';
  if (!keyring.has(primaryId) && env.DATA_ENCRYPTION_KEY) {
    keyring.set(primaryId, deriveKey(env.DATA_ENCRYPTION_KEY));
  }

  if (keyring.size === 0 && env.DATA_ENCRYPTION_KEY) {
    keyring.set(primaryId, deriveKey(env.DATA_ENCRYPTION_KEY));
  }

  const resolvedPrimary = keyring.has(primaryId) ? primaryId : keyring.keys().next().value;
  return { keyring, primaryId: resolvedPrimary };
};

const { keyring, primaryId } = buildKeyring();

const decryptWithKey = (key, iv, tag, data) => {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};

const encrypt = (value) => {
  if (value === null || value === undefined || value === '') return value;
  const iv = crypto.randomBytes(12);
  const key = keyring.get(primaryId);
  if (!key) return value;
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${primaryId}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = (value) => {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;

  const payload = value.slice(PREFIX.length);
  const parts = payload.split(':');

  const hasKeyId = parts.length >= 4;
  const keyId = hasKeyId ? parts[0] : null;
  const offset = hasKeyId ? 1 : 0;
  const ivB64 = parts[offset];
  const tagB64 = parts[offset + 1];
  const dataB64 = parts[offset + 2];

  if (!ivB64 || !tagB64 || !dataB64) return value;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    if (keyId && keyring.has(keyId)) {
      return decryptWithKey(keyring.get(keyId), iv, tag, data);
    }

    for (const candidate of keyring.values()) {
      try {
        return decryptWithKey(candidate, iv, tag, data);
      } catch {
        // Try next key.
      }
    }

    return value;
  } catch {
    return value;
  }
};

module.exports = { encrypt, decrypt };
