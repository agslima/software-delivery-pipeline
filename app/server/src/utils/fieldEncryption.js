const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc::';

const deriveKey = (input) => crypto.createHash('sha256').update(String(input)).digest();

const key = deriveKey(env.DATA_ENCRYPTION_KEY);

const encrypt = (value) => {
  if (value === null || value === undefined || value === '') return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = (value) => {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;

  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(':');

  if (!ivB64 || !tagB64 || !dataB64) return value;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return value;
  }
};

module.exports = { encrypt, decrypt };
