const { createHmac, randomBytes } = require('crypto');
const qrcode = require('qrcode');
const { AppError } = require('../../api/http/errors/AppError');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const normalizeBase32 = (input) =>
  (input || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');

const base32ToBuffer = (input) => {
  const normalized = normalizeBase32(input);
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const hotp = (secret, counter, digits = 6) => {
  const buf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i -= 1) {
    buf[i] = tmp & 0xff;
    tmp >>= 8;
  }

  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 10 ** digits).toString().padStart(digits, '0');
};

const generateCode = (secret, { time = Date.now(), step = 30, digits = 6 } = {}) => {
  const counter = Math.floor(time / 1000 / step);
  const secretBuf = base32ToBuffer(secret);
  return hotp(secretBuf, counter, digits);
};

const verifyCode = (secret, code, { time = Date.now(), step = 30, digits = 6, window = 1 } = {}) => {
  if (!secret || !code) return false;
  const normalized = String(code).trim();
  const counter = Math.floor(time / 1000 / step);
  const secretBuf = base32ToBuffer(secret);

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(secretBuf, counter + offset, digits);
    if (expected === normalized) return true;
  }

  return false;
};

class MfaService {
  constructor({ usersRepository, now = () => Date.now() } = {}) {
    this.usersRepository = usersRepository;
    this.now = now;
  }

  _generateSecret() {
    const bytes = randomBytes(20);
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  _buildOtpAuthUrl({ secret, label, issuer }) {
    const encodedLabel = encodeURIComponent(label);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&digits=6&period=30`;
  }

  async enroll({ userId, label, issuer }) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    const secret = this._generateSecret();
    await this.usersRepository.setMfaSecret(user.id, secret);
    await this.usersRepository.setMfaEnabled(user.id, false);

    const otpauthUrl = this._buildOtpAuthUrl({ secret, label, issuer });
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async verify({ userId, code }) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    if (!user.mfa_secret) {
      throw new AppError({ status: 400, code: 'MFA_NOT_CONFIGURED', message: 'MFA not configured' });
    }

    const valid = verifyCode(user.mfa_secret, code, { time: this.now() });
    if (!valid) {
      throw new AppError({ status: 400, code: 'INVALID_MFA_CODE', message: 'Invalid MFA code' });
    }

    if (!user.mfa_enabled) {
      await this.usersRepository.setMfaEnabled(user.id, true);
    }

    return { verified: true };
  }
}

module.exports = { MfaService, generateCode, verifyCode };
