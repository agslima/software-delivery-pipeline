const db = require('../../infra/db/knex');
const { AppError } = require('../../api/http/errors/AppError');

const mapPatient = (row) => ({
  id: row.id,
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
  dob: row.dob,
  gender: row.gender,
  phone: row.phone,
  email: row.email,
  address: row.address,
});

const mapAllergy = (row) => ({
  id: row.id,
  substance: row.substance,
  reaction: row.reaction,
  severity: row.severity,
});

class PatientsService {
  constructor({ patientsRepository, allergiesRepository, prescriptionsRepository, doctorContext }) {
    this.patientsRepository = patientsRepository;
    this.allergiesRepository = allergiesRepository;
    this.prescriptionsRepository = prescriptionsRepository;
    this.doctorContext = doctorContext;
  }

  async search({ doctorUserId, name, dob, patientId, limit }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const patients = await this.patientsRepository.searchForDoctor({
      doctorId: doctor.id,
      name,
      dob,
      patientId,
      limit,
    });

    return patients.map(mapPatient);
  }

  async getById({ doctorUserId, patientId }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    await this.doctorContext.ensurePatientAccess({ doctorId: doctor.id, patientId });

    const patient = await this.patientsRepository.findById(patientId);
    if (!patient) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Patient not found' });
    }

    return mapPatient(patient);
  }

  async getSummary({ doctorUserId, patientId }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    await this.doctorContext.ensurePatientAccess({ doctorId: doctor.id, patientId });

    const patient = await this.patientsRepository.findById(patientId);
    if (!patient) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Patient not found' });
    }

    const allergies = await this.allergiesRepository.findByPatientId(patientId);

    const medicationHistory = await db
      .withSchema('v2')
      .select(
        'm.id',
        'm.name',
        'm.form',
        'm.strength'
      )
      .max('p.issued_at as last_prescribed_at')
      .from({ pi: 'prescription_items' })
      .join({ p: 'prescriptions' }, 'pi.prescription_id', 'p.id')
      .join({ m: 'medications_catalog' }, 'pi.medication_id', 'm.id')
      .where('p.patient_id', patientId)
      .groupBy('m.id', 'm.name', 'm.form', 'm.strength')
      .orderBy('last_prescribed_at', 'desc');

    const prescriptions = await this.prescriptionsRepository.listByPatientId(patientId);

    return {
      patient: mapPatient(patient),
      allergies: allergies.map(mapAllergy),
      medicationHistory: medicationHistory.map((row) => ({
        id: row.id,
        name: row.name,
        form: row.form,
        strength: row.strength,
        lastPrescribedAt: row.last_prescribed_at,
      })),
      prescriptions,
    };
  }

  async getPrescriptions({ doctorUserId, patientId }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    await this.doctorContext.ensurePatientAccess({ doctorId: doctor.id, patientId });

    return this.prescriptionsRepository.listByPatientId(patientId);
  }
}

module.exports = { PatientsService };
