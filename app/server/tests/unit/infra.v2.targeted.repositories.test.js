describe('Unit: infra v2 targeted repositories', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete global.fetch;
  });

  describe('OidcTokenService', () => {
    it('verifies token using JWKS key lookup', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ keys: [{ kid: 'kid-1', kty: 'RSA', n: 'abc', e: 'AQAB' }] }),
      });
      const decode = jest.fn().mockReturnValue({ header: { kid: 'kid-1', alg: 'RS256' } });
      const verify = jest.fn().mockReturnValue({ sub: 'user-1' });
      const createPublicKey = jest.fn().mockReturnValue('public-key');

      jest.doMock('jsonwebtoken', () => ({ decode, verify }));
      jest.doMock('crypto', () => ({ createPublicKey }));
      jest.doMock('../../src/config/oidc', () => ({
        issuer: 'https://issuer.example',
        audience: 'stayhealthy-api',
        clockToleranceSeconds: 7,
        jwksUri: 'https://issuer.example/.well-known/jwks.json',
      }));

      let service;
      jest.isolateModules(() => {
        service = require('../../src/infra/auth/oidcToken.service');
      });

      await expect(service.verify('token-1')).resolves.toEqual({ sub: 'user-1' });
      expect(global.fetch).toHaveBeenCalledWith('https://issuer.example/.well-known/jwks.json', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      expect(createPublicKey).toHaveBeenCalledWith({
        key: { kid: 'kid-1', kty: 'RSA', n: 'abc', e: 'AQAB' },
        format: 'jwk',
      });
      expect(verify).toHaveBeenCalledWith('token-1', 'public-key', {
        issuer: 'https://issuer.example',
        audience: 'stayhealthy-api',
        algorithms: ['RS256'],
        clockTolerance: 7,
      });
    });

    it('fails for invalid token header or unsupported algorithm', async () => {
      const decode = jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ header: { kid: 'kid-1', alg: 'HS256' } });
      jest.doMock('jsonwebtoken', () => ({ decode, verify: jest.fn() }));
      jest.doMock('../../src/config/oidc', () => ({
        issuer: 'https://issuer.example',
        audience: 'stayhealthy-api',
        clockToleranceSeconds: 5,
        jwksUri: 'https://issuer.example/.well-known/jwks.json',
      }));

      let service;
      jest.isolateModules(() => {
        service = require('../../src/infra/auth/oidcToken.service');
      });

      await expect(service.verify('bad-token')).rejects.toMatchObject({ code: 'INVALID_TOKEN', status: 401 });
      await expect(service.verify('bad-alg-token')).rejects.toMatchObject({ code: 'INVALID_TOKEN', status: 401 });
    });

    it('fails when JWKS fetch fails, key is missing, or key is invalid', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ keys: [] }) })
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ keys: [{ kid: 'kid-1' }] }) });
      const decode = jest.fn().mockReturnValue({ header: { kid: 'kid-1', alg: 'RS256' } });
      const createPublicKey = jest.fn().mockImplementation(() => {
        throw new Error('bad-jwk');
      });

      const loadService = () => {
        let svc;
        jest.doMock('jsonwebtoken', () => ({ decode, verify: jest.fn() }));
        jest.doMock('crypto', () => ({ createPublicKey }));
        jest.doMock('../../src/config/oidc', () => ({
          issuer: 'https://issuer.example',
          audience: 'stayhealthy-api',
          clockToleranceSeconds: 5,
          jwksUri: 'https://issuer.example/.well-known/jwks.json',
        }));
        jest.isolateModules(() => {
          svc = require('../../src/infra/auth/oidcToken.service');
        });
        return svc;
      };

      await expect(loadService().verify('fetch-fail')).rejects.toMatchObject({ code: 'OIDC_JWKS_FETCH_FAILED', status: 500 });
      jest.resetModules();
      await expect(loadService().verify('key-missing')).rejects.toMatchObject({ code: 'OIDC_KEY_NOT_FOUND', status: 401 });
      jest.resetModules();
      await expect(loadService().verify('invalid-key')).rejects.toMatchObject({ code: 'OIDC_KEY_INVALID', status: 401 });
    });
  });

  describe('v2 repositories', () => {
    it('AllergiesRepository queries by patient with descending creation order', async () => {
      const orderBy = jest.fn().mockResolvedValue([{ id: 'allergy-1' }]);
      const where = jest.fn(() => ({ orderBy }));
      const from = jest.fn(() => ({ where }));
      const withSchema = jest.fn(() => ({ from }));
      jest.doMock('../../src/infra/db/knex', () => ({ withSchema }));

      let AllergiesRepository;
      jest.isolateModules(() => {
        ({ AllergiesRepository } = require('../../src/infra/v2/allergies.repository'));
      });

      const repo = new AllergiesRepository();
      await expect(repo.findByPatientId('patient-1')).resolves.toEqual([{ id: 'allergy-1' }]);
      expect(withSchema).toHaveBeenCalledWith('v2');
      expect(from).toHaveBeenCalledWith('allergies');
      expect(where).toHaveBeenCalledWith({ patient_id: 'patient-1' });
      expect(orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('DoctorsRepository fetches doctor by doctor id and user id', async () => {
      const first = jest.fn().mockResolvedValue({ id: 'doc-1' });
      const where = jest.fn(() => ({ first }));
      const join = jest.fn(() => ({ where }));
      const from = jest.fn(() => ({ join }));
      const select = jest.fn(() => ({ from }));
      const withSchema = jest.fn(() => ({ select }));
      jest.doMock('../../src/infra/db/knex', () => ({ withSchema }));

      let DoctorsRepository;
      jest.isolateModules(() => {
        ({ DoctorsRepository } = require('../../src/infra/v2/doctors.repository'));
      });

      const repo = new DoctorsRepository();
      await expect(repo.findById('doc-1')).resolves.toEqual({ id: 'doc-1' });
      await expect(repo.findByUserId('user-1')).resolves.toEqual({ id: 'doc-1' });

      expect(withSchema).toHaveBeenCalledWith('v2');
      expect(from).toHaveBeenCalledWith('doctors as d');
      expect(join).toHaveBeenCalledWith('users as u', 'd.user_id', 'u.id');
      expect(where).toHaveBeenNthCalledWith(1, 'd.id', 'doc-1');
      expect(where).toHaveBeenNthCalledWith(2, 'u.id', 'user-1');
      expect(first).toHaveBeenCalledTimes(2);
    });

    it('EncountersRepository applies optional status filtering and supports create/update', async () => {
      const first = jest
        .fn()
        .mockResolvedValueOnce({ id: 'enc-1' })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'enc-2', status: 'open' });
      const andWhere = jest.fn();
      const update = jest.fn().mockResolvedValue(1);
      const chain = {
        modify: jest.fn((cb) => {
          cb({ andWhere });
          return chain;
        }),
        orderBy: jest.fn(() => chain),
        first,
        update,
      };
      const where = jest.fn(() => chain);
      const insert = jest.fn().mockResolvedValue([1]);
      const from = jest.fn(() => ({ where, insert }));
      const withSchema = jest.fn(() => ({ from }));
      jest.doMock('../../src/infra/db/knex', () => ({ withSchema }));

      let EncountersRepository;
      jest.isolateModules(() => {
        ({ EncountersRepository } = require('../../src/infra/v2/encounters.repository'));
      });

      const repo = new EncountersRepository();
      await expect(repo.findByDoctorPatient({ doctorId: 'doc-1', patientId: 'pat-1', status: 'active' })).resolves.toEqual({ id: 'enc-1' });
      await expect(repo.existsForDoctorPatient({ doctorId: 'doc-1', patientId: 'pat-1' })).resolves.toBe(false);

      jest.spyOn(repo, 'findById').mockResolvedValue({ id: 'enc-2', status: 'open' });
      await expect(repo.create({ id: 'enc-2', patient_id: 'pat-2' })).resolves.toEqual({ id: 'enc-2', status: 'open' });
      await expect(repo.update('enc-2', { status: 'closed' })).resolves.toEqual({ id: 'enc-2', status: 'open' });

      expect(andWhere).toHaveBeenCalledWith('status', 'active');
      expect(where).toHaveBeenCalledWith({ doctor_id: 'doc-1', patient_id: 'pat-1' });
      expect(chain.orderBy).toHaveBeenCalledWith('started_at', 'desc');
      expect(insert).toHaveBeenCalledWith({ id: 'enc-2', patient_id: 'pat-2' });
      expect(update).toHaveBeenCalledWith({ status: 'closed' });
    });

    it('PrescriptionsRepository maps records, encrypts writes, and supports doctor-scoped filters', async () => {
      const decrypt = jest.fn((value) => (value ? `dec:${value}` : value));
      const encrypt = jest.fn((value) => `enc:${value}`);
      const randomUUID = jest.fn().mockReturnValueOnce('rx-new').mockReturnValueOnce('item-new');
      jest.doMock('../../src/utils/fieldEncryption', () => ({ decrypt, encrypt }));
      jest.doMock('crypto', () => ({ randomUUID }));

      const detailRow = {
        id: 'rx-1', status: 'active', issued_at: '2026-01-01', expires_at: null, notes: 'enc:note',
        doctor_id: 'doc-1', doctor_first_name: 'Sam', doctor_last_name: 'Lee', patient_id: 'pat-1', patient_first_name: 'Pat', patient_last_name: 'One',
      };
      const itemsRows = [
        {
          id: 'item-1', medication_id: 'med-1', medication_name: 'Ibuprofen', medication_form: 'tablet', medication_strength: '200mg',
          dose: '200mg', route: 'oral', frequency: 'BID', duration: '5 days', quantity: '10', instructions: 'enc:with food',
        },
      ];
      const listRows = [
        {
          id: 'rx-2', status: 'completed', issued_at: '2026-01-02', expires_at: null, notes: 'enc:list-note', doctor_id: 'doc-2',
          doctor_first_name: 'Ana', doctor_last_name: 'Kay',
        },
      ];

      const detailQuery = Promise.resolve(detailRow);
      detailQuery.andWhere = jest.fn(() => detailQuery);
      const listQuery = Promise.resolve(listRows);
      listQuery.andWhere = jest.fn(() => listQuery);

      const update = jest.fn().mockResolvedValue(1);
      const insert = jest.fn().mockResolvedValue([1]);

      const client = {
        select: jest.fn((...cols) => ({
          from: jest.fn((table) => {
            if (table === 'prescriptions as p' && cols.includes('p.*')) {
              return {
                join: jest.fn(() => ({ join: jest.fn(() => ({ where: jest.fn(() => ({ first: jest.fn(() => detailQuery) })) })) })),
              };
            }
            if (table === 'prescription_items as pi') {
              return {
                join: jest.fn(() => ({ where: jest.fn(() => ({ orderBy: jest.fn().mockResolvedValue(itemsRows) })) })),
              };
            }
            if (table === 'prescriptions as p') {
              return {
                join: jest.fn(() => ({ where: jest.fn(() => ({ orderBy: jest.fn(() => listQuery) })) })),
              };
            }
            return {};
          }),
        })),
        from: jest.fn((table) => {
          if (table === 'prescriptions') return { insert, where: jest.fn(() => ({ update })) };
          if (table === 'prescription_items') return { insert };
          return {};
        }),
      };

      const withSchema = jest.fn(() => client);
      const transaction = jest.fn(async (cb) => cb({ withSchema }));
      jest.doMock('../../src/infra/db/knex', () => ({ withSchema, transaction }));

      let PrescriptionsRepository;
      jest.isolateModules(() => {
        ({ PrescriptionsRepository } = require('../../src/infra/v2/prescriptions.repository'));
      });

      const repo = new PrescriptionsRepository();

      await expect(repo.findById('rx-1', { doctorId: 'doc-1' })).resolves.toMatchObject({
        id: 'rx-1',
        notes: 'dec:enc:note',
        items: [expect.objectContaining({ instructions: 'dec:enc:with food', name: 'Ibuprofen' })],
      });
      expect(detailQuery.andWhere).toHaveBeenCalledWith('p.doctor_id', 'doc-1');

      await expect(repo.listByPatientId('pat-1', { doctorId: 'doc-2' })).resolves.toEqual([
        expect.objectContaining({ id: 'rx-2', notes: 'dec:enc:list-note' }),
      ]);
      expect(listQuery.andWhere).toHaveBeenCalledWith('p.doctor_id', 'doc-2');

      const persistedCreate = {
        id: 'rx-new',
        notes: 'enc:new-note',
        items: [{ medicationId: 'med-9', instructions: 'enc:take daily' }],
      };
      const persistedUpdate = {
        id: 'rx-1',
        notes: 'enc:updated-note',
        items: [{ medicationId: 'med-9', instructions: 'enc:take daily' }],
      };
      const findByIdSpy = jest.spyOn(repo, 'findById')
        .mockResolvedValueOnce(persistedCreate)
        .mockResolvedValueOnce(persistedUpdate);

      await expect(repo.create({
        patientId: 'pat-3',
        doctorId: 'doc-3',
        encounterId: null,
        status: 'active',
        notes: 'new-note',
        items: [{ medicationId: 'med-9', instructions: 'take daily' }],
      })).resolves.toEqual(persistedCreate);

      expect(findByIdSpy).toHaveBeenNthCalledWith(1, 'rx-new', { trx: expect.any(Object) });

      await expect(repo.update('rx-1', { status: 'cancelled', notes: 'updated-note' })).resolves.toEqual(persistedUpdate);

      expect(findByIdSpy).toHaveBeenNthCalledWith(2, 'rx-1');
      expect(encrypt).toHaveBeenCalledWith('new-note');
      expect(encrypt).toHaveBeenCalledWith('take daily');
      expect(encrypt).toHaveBeenCalledWith('updated-note');
    });
  });
});
