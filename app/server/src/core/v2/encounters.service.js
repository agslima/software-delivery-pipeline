const { randomUUID } = require('crypto');
const { AppError } = require('../../api/http/errors/AppError');

const mapEncounter = (row) => ({
  id: row.id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  facilityId: row.facility_id,
  status: row.status,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

class EncountersService {
  constructor({ encountersRepository, patientsRepository, doctorContext }) {
    this.encountersRepository = encountersRepository;
    this.patientsRepository = patientsRepository;
    this.doctorContext = doctorContext;
  }

  async create({ doctorUserId, patientId, facilityId }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const patient = await this.patientsRepository.findById(patientId);

    if (!patient) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Patient not found' });
    }

    const existing = await this.encountersRepository.findByDoctorPatient({
      doctorId: doctor.id,
      patientId,
      status: 'open',
    });

    if (existing) {
      throw new AppError({ status: 409, code: 'ENCOUNTER_EXISTS', message: 'Open encounter already exists' });
    }

    const encounter = await this.encountersRepository.create({
      id: randomUUID(),
      patient_id: patientId,
      doctor_id: doctor.id,
      facility_id: facilityId || null,
      status: 'open',
      started_at: new Date(),
      ended_at: null,
    });

    return mapEncounter(encounter);
  }

  async updateStatus({ doctorUserId, encounterId, status }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const encounter = await this.encountersRepository.findById(encounterId);

    if (!encounter) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Encounter not found' });
    }

    if (encounter.doctor_id !== doctor.id) {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const updates = { status };

    if (status === 'closed') {
      updates.ended_at = new Date();
    }

    if (status === 'open') {
      updates.ended_at = null;
      if (!encounter.started_at) {
        updates.started_at = new Date();
      }
    }

    const updated = await this.encountersRepository.update(encounterId, updates);
    return mapEncounter(updated);
  }
}

module.exports = { EncountersService };
