const { buildTestId } = require('../helpers/testCredentials');

describe('Unit: infra repositories', () => {
  describe('UsersRepository', () => {
    const buildDb = () => {
      const first = jest.fn();
      const update = jest.fn();
      const where = jest.fn(() => ({ first, update }));
      const from = jest.fn(() => ({ where }));
      const withSchema = jest.fn(() => ({ from }));
      return { db: { withSchema }, withSchema, from, where, first, update };
    };

    it('returns null for empty lookup args', async () => {
      const { UsersRepository } = require('../../src/infra/users/users.repository');
      const { db, withSchema } = buildDb();
      const repo = new UsersRepository(db);

      await expect(repo.findByEmail('')).resolves.toBeNull();
      await expect(repo.findById('')).resolves.toBeNull();
      expect(withSchema).not.toHaveBeenCalled();
    });

    it('queries users by email/id and updates MFA fields', async () => {
      const { UsersRepository } = require('../../src/infra/users/users.repository');
      const { db, withSchema, from, where, first, update } = buildDb();
      const repo = new UsersRepository(db);
      const userId = buildTestId();
      const email = 'doctor@example.com';

      first
        .mockResolvedValueOnce({ id: userId, email })
        .mockResolvedValueOnce({ id: userId, email });
      update.mockResolvedValue(1);

      await expect(repo.findByEmail(email)).resolves.toEqual({ id: userId, email });
      await expect(repo.findById(userId)).resolves.toEqual({ id: userId, email });
      await expect(repo.setMfaEnabled(userId, true)).resolves.toBe(1);
      await expect(repo.setMfaSecret(userId, 'secret')).resolves.toBe(1);

      expect(withSchema).toHaveBeenCalledWith('v2');
      expect(from).toHaveBeenCalledWith('users');
      expect(where).toHaveBeenNthCalledWith(1, { email });
      expect(where).toHaveBeenNthCalledWith(2, { id: userId });
      expect(where).toHaveBeenNthCalledWith(3, { id: userId });
      expect(where).toHaveBeenNthCalledWith(4, { id: userId });
      expect(update).toHaveBeenNthCalledWith(1, { mfa_enabled: true });
      expect(update).toHaveBeenNthCalledWith(2, { mfa_secret: 'secret' });
    });
  });

  describe('PrescriptionsRepository', () => {
    afterEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      jest.dontMock('../../src/infra/db/knex');
      jest.dontMock('../../src/config/env');
    });

    it('returns fixture data in test mode', async () => {
      jest.doMock('../../src/config/env', () => ({ NODE_ENV: 'test' }));
      jest.doMock('../../src/infra/db/knex', () => jest.fn());

      let PrescriptionsRepository;
      jest.isolateModules(() => {
        ({ PrescriptionsRepository } = require('../../src/infra/prescriptions/prescriptions.repository'));
      });

      const repo = new PrescriptionsRepository();
      await expect(repo.findById('demo-id')).resolves.toMatchObject({ id: 'demo-id', clinicName: 'StayHealthy' });
      await expect(repo.findById('missing')).resolves.toBeNull();
    });

    it('maps database shape outside test mode', async () => {
      const first = jest.fn().mockResolvedValue({
        id: 'rx-1',
        clinic_name: 'Clinic',
        date: '2024-01-01',
        doctor: { name: 'Dr A' },
        patient: { name: 'P B' },
        medications: [{ name: 'Med' }],
      });
      const where = jest.fn(() => ({ first }));
      const dbMock = jest.fn(() => ({ where }));

      jest.doMock('../../src/config/env', () => ({ NODE_ENV: 'production' }));
      jest.doMock('../../src/infra/db/knex', () => dbMock);

      let PrescriptionsRepository;
      jest.isolateModules(() => {
        ({ PrescriptionsRepository } = require('../../src/infra/prescriptions/prescriptions.repository'));
      });

      const repo = new PrescriptionsRepository();
      await expect(repo.findById('rx-1')).resolves.toEqual({
        id: 'rx-1',
        clinicName: 'Clinic',
        date: '2024-01-01',
        doctor: { name: 'Dr A' },
        patient: { name: 'P B' },
        medications: [{ name: 'Med' }],
      });

      first.mockResolvedValueOnce(null);
      await expect(repo.findById('missing')).resolves.toBeNull();
      expect(dbMock).toHaveBeenCalledWith('prescriptions');
      expect(where).toHaveBeenNthCalledWith(1, { id: 'rx-1' });
      expect(where).toHaveBeenNthCalledWith(2, { id: 'missing' });
    });
  });

  describe('MedicationsRepository', () => {
    afterEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      jest.dontMock('../../src/infra/db/knex');
    });

    it('returns empty list when ids are missing', async () => {
      const dbMock = { withSchema: jest.fn() };
      jest.doMock('../../src/infra/db/knex', () => dbMock);

      let MedicationsRepository;
      jest.isolateModules(() => {
        ({ MedicationsRepository } = require('../../src/infra/v2/medications.repository'));
      });

      const repo = new MedicationsRepository();
      await expect(repo.findByIds()).resolves.toEqual([]);
      await expect(repo.findByIds([])).resolves.toEqual([]);
      expect(dbMock.withSchema).not.toHaveBeenCalled();
    });

    it('queries catalog for id lookups and search', async () => {
      const select = jest.fn().mockResolvedValue([{ id: 'med-1', name: 'Amoxicillin' }]);
      const limit = jest.fn(() => ({ select }));
      const orderBy = jest.fn(() => ({ limit }));
      const andWhere = jest.fn(() => ({ orderBy }));
      const whereILike = jest.fn(() => ({ andWhere }));
      const whereIn = jest.fn(() => ({ select }));
      const from = jest.fn(() => ({ whereIn, whereILike }));
      const withSchema = jest.fn(() => ({ from }));
      const dbMock = { withSchema };

      jest.doMock('../../src/infra/db/knex', () => dbMock);

      let MedicationsRepository;
      jest.isolateModules(() => {
        ({ MedicationsRepository } = require('../../src/infra/v2/medications.repository'));
      });

      const repo = new MedicationsRepository();
      await expect(repo.findByIds(['med-1'])).resolves.toEqual([{ id: 'med-1', name: 'Amoxicillin' }]);
      await expect(repo.search('amox', 5)).resolves.toEqual([{ id: 'med-1', name: 'Amoxicillin' }]);

      expect(withSchema).toHaveBeenCalledWith('v2');
      expect(from).toHaveBeenCalledWith('medications_catalog');
      expect(whereIn).toHaveBeenCalledWith('id', ['med-1']);
      expect(whereILike).toHaveBeenCalledWith('name', '%amox%');
      expect(andWhere).toHaveBeenCalledWith('is_active', true);
      expect(orderBy).toHaveBeenCalledWith('name');
      expect(limit).toHaveBeenCalledWith(5);
    });
  });
});
