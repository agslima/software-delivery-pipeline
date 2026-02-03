const { AppError } = require('../../api/http/errors/AppError');

class PrescriptionsService {
  constructor({ prescriptionsRepository, patientsRepository, encountersRepository, medicationsRepository, doctorContext }) {
    this.prescriptionsRepository = prescriptionsRepository;
    this.patientsRepository = patientsRepository;
    this.encountersRepository = encountersRepository;
    this.medicationsRepository = medicationsRepository;
    this.doctorContext = doctorContext;
  }

  async create({ doctorUserId, payload }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const patient = await this.patientsRepository.findById(payload.patientId);

    if (!patient) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Patient not found' });
    }

    let encounterId = payload.encounterId;
    if (encounterId) {
      const encounter = await this.encountersRepository.findById(encounterId);
      if (!encounter) {
        throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Encounter not found' });
      }
      if (encounter.doctor_id !== doctor.id || encounter.patient_id !== payload.patientId) {
        throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Encounter access denied' });
      }
    } else {
      const encounter = await this.encountersRepository.findByDoctorPatient({
        doctorId: doctor.id,
        patientId: payload.patientId,
        status: 'open',
      });
      if (!encounter) {
        throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Active encounter required' });
      }
      encounterId = encounter.id;
    }

    const medicationIds = payload.items.map((item) => item.medicationId);
    const medications = await this.medicationsRepository.findByIds(medicationIds);
    const validIds = new Set(medications.map((med) => med.id));
    const missingIds = medicationIds.filter((id) => !validIds.has(id));

    if (missingIds.length > 0) {
      throw new AppError({
        status: 400,
        code: 'INVALID_MEDICATION',
        message: 'One or more medications are invalid',
        details: missingIds.map((id) => ({ medicationId: id })),
      });
    }

    return this.prescriptionsRepository.create({
      patientId: payload.patientId,
      doctorId: doctor.id,
      encounterId,
      status: 'active',
      issuedAt: new Date(),
      expiresAt: payload.expiresAt || null,
      notes: payload.notes || null,
      items: payload.items,
    });
  }

  async getById({ doctorUserId, prescriptionId }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const prescription = await this.prescriptionsRepository.findById(prescriptionId);

    if (!prescription) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found' });
    }

    await this.doctorContext.ensurePatientAccess({ doctorId: doctor.id, patientId: prescription.patient.id });

    return prescription;
  }

  async update({ doctorUserId, prescriptionId, updates }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const existing = await this.prescriptionsRepository.findById(prescriptionId);

    if (!existing) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found' });
    }

    if (existing.doctor.id !== doctor.id) {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Only the prescribing doctor can update' });
    }

    const updatePayload = {};
    if (updates.status) updatePayload.status = updates.status;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.expiresAt !== undefined) updatePayload.expires_at = updates.expiresAt;

    if (Object.keys(updatePayload).length === 0) {
      return existing;
    }

    return this.prescriptionsRepository.update(prescriptionId, updatePayload);
  }
}

module.exports = { PrescriptionsService };
