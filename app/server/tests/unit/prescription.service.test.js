// app/server/tests/unit/prescription.service.test.js
const PrescriptionService = require('../../src/modules/prescription/prescription.service');

describe('Unit: PrescriptionService', () => {
  let service;

  beforeEach(() => {
    service = new PrescriptionService();
  });

  it('should return prescription data for a valid ID', async () => {
    const data = await service.getById('demo-id');
    expect(data).toBeDefined();
    expect(data.clinicName).toBe('StayHealthy');
  });

  it('should throw 404 error for invalid ID', async () => {
    try {
      await service.getById('bad-id');
    } catch (error) {
      expect(error.message).toBe('Prescription not found');
      expect(error.statusCode).toBe(404);
    }
  });
});
