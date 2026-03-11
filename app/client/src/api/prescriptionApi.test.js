import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, getPrescription } from './prescriptionApi';

describe('prescriptionApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('returns token on successful login', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ token: 'token-123' }),
      });

      const token = await login('admin', 'secret');

      expect(fetch).toHaveBeenCalledWith('/api/v1/auth/login',
        expect.objectContaining({ method: 'POST' }));
      expect(token).toBe('token-123');
    });

    it('throws INCORRECT_CREDENTIALS for 401', async () => {
      fetch.mockResolvedValue({ ok: false, status: 401 });

      await expect(login('admin', 'wrong')).rejects.toThrow('INCORRECT_CREDENTIALS');
    });

    it('throws SERVER_ERROR for non-401 unsuccessful responses', async () => {
      fetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(login('admin', 'secret')).rejects.toThrow('SERVER_ERROR');
    });

    it.each([
      ['Error', () => new Error('Failed to fetch')],
      ['TypeError (undici)', () => new TypeError('fetch failed')],
      ['browser NetworkError', () => new TypeError('NetworkError when attempting to fetch resource')],
    ])('maps %s network failure messages to NETWORK_ERROR', async (_, createError) => {
      fetch.mockRejectedValue(createError());

      await expect(login('admin', 'secret')).rejects.toThrow('NETWORK_ERROR');
    });

    it('maps network errors exposed on error cause to NETWORK_ERROR', async () => {
      fetch.mockRejectedValue(
        new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' } })
      );

      await expect(login('admin', 'secret')).rejects.toThrow('NETWORK_ERROR');
    });
  });

  describe('getPrescription', () => {
    it('returns parsed prescription JSON on success', async () => {
      const mockData = { id: 'rx-1', status: 'active' };
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const result = await getPrescription('rx-1', 'token-1');

      expect(fetch).toHaveBeenCalledWith('/api/v1/prescriptions/rx-1', {
        headers: { Authorization: 'Bearer token-1' },
      });
      expect(result).toEqual(mockData);
    });

    it('throws SESSION_EXPIRED on 401 response', async () => {
      fetch.mockResolvedValue({ ok: false, status: 401 });

      await expect(getPrescription('rx-2', 'token-2')).rejects.toThrow('SESSION_EXPIRED');
    });

    it('throws SERVER_ERROR on non-401 error responses', async () => {
      fetch.mockResolvedValue({ ok: false, status: 403 });

      await expect(getPrescription('rx-3', 'token-3')).rejects.toThrow('SERVER_ERROR');
    });
  });
});
