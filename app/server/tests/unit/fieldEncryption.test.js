const { encrypt, decrypt } = require('../../src/utils/fieldEncryption');

describe('Unit: fieldEncryption', () => {
  it('round-trips plaintext', () => {
    const input = 'Sensitive instructions';
    const encrypted = encrypt(input);
    expect(encrypted).not.toBe(input);
    expect(encrypted.startsWith('enc::')).toBe(true);
    expect(decrypt(encrypted)).toBe(input);
  });

  it('passes through empty values', () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt('')).toBe('');
    expect(decrypt(null)).toBeNull();
    expect(decrypt('')).toBe('');
  });

  it('passes through non-encrypted values', () => {
    expect(decrypt('plain-text')).toBe('plain-text');
  });

  it('decrypts legacy payloads without key id', () => {
    const input = 'Legacy value';
    const encrypted = encrypt(input);
    const payload = encrypted.replace(/^enc::[^:]+:/, 'enc::');
    expect(decrypt(payload)).toBe(input);
  });
});
