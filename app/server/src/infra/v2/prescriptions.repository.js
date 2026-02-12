const { randomUUID } = require('crypto');
const db = require('../db/knex');
const { encrypt, decrypt } = require('../../utils/fieldEncryption');

const withSchema = (client) => (client || db).withSchema('v2');

const mapPrescription = (row, items = []) => {
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    notes: decrypt(row.notes),
    doctor: {
      id: row.doctor_id,
      name: `${row.doctor_first_name} ${row.doctor_last_name}`.trim(),
    },
    patient: {
      id: row.patient_id,
      name: `${row.patient_first_name} ${row.patient_last_name}`.trim(),
    },
    items,
    interactionWarnings: [],
  };
};

class PrescriptionsRepository {
  async findById(id, { doctorId, trx } = {}) {
    const client = withSchema(trx);
    const query = client
      .select(
        'p.*',
        'pa.first_name as patient_first_name',
        'pa.last_name as patient_last_name',
        'd.first_name as doctor_first_name',
        'd.last_name as doctor_last_name'
      )
      .from('prescriptions as p')
      .join('patients as pa', 'p.patient_id', 'pa.id')
      .join('doctors as d', 'p.doctor_id', 'd.id')
      .where('p.id', id)
      .first();

    if (doctorId) {
      query.andWhere('p.doctor_id', doctorId);
    }

    const row = await query;
    if (!row) return null;

    const items = await client
      .select(
        'pi.id',
        'pi.medication_id',
        'pi.dose',
        'pi.route',
        'pi.frequency',
        'pi.duration',
        'pi.quantity',
        'pi.instructions',
        'm.name as medication_name',
        'm.form as medication_form',
        'm.strength as medication_strength'
      )
      .from('prescription_items as pi')
      .join('medications_catalog as m', 'pi.medication_id', 'm.id')
      .where('pi.prescription_id', id)
      .orderBy('pi.created_at', 'asc');

    const mappedItems = items.map((item) => ({
      id: item.id,
      medicationId: item.medication_id,
      name: item.medication_name,
      form: item.medication_form,
      strength: item.medication_strength,
      dose: item.dose,
      route: item.route,
      frequency: item.frequency,
      duration: item.duration,
      quantity: item.quantity,
      instructions: decrypt(item.instructions),
    }));

    return mapPrescription(row, mappedItems);
  }

  async listByPatientId(patientId, { doctorId } = {}) {
    const query = db
      .withSchema('v2')
      .select(
        'p.id',
        'p.status',
        'p.issued_at',
        'p.expires_at',
        'p.notes',
        'p.patient_id',
        'p.doctor_id',
        'd.first_name as doctor_first_name',
        'd.last_name as doctor_last_name'
      )
      .from('prescriptions as p')
      .join('doctors as d', 'p.doctor_id', 'd.id')
      .where('p.patient_id', patientId)
      .orderBy('p.issued_at', 'desc');

    if (doctorId) {
      query.andWhere('p.doctor_id', doctorId);
    }

    const rows = await query;

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      notes: decrypt(row.notes),
      doctor: {
        id: row.doctor_id,
        name: `${row.doctor_first_name} ${row.doctor_last_name}`.trim(),
      },
    }));
  }

  async create({ patientId, doctorId, encounterId, status, issuedAt, expiresAt, notes, items }) {
    return db.transaction(async (trx) => {
      const prescriptionId = randomUUID();
      const now = issuedAt || new Date();

      await trx.withSchema('v2').from('prescriptions').insert({
        id: prescriptionId,
        patient_id: patientId,
        doctor_id: doctorId,
        encounter_id: encounterId || null,
        status,
        issued_at: now,
        expires_at: expiresAt || null,
        notes: notes ? encrypt(notes) : null,
      });

      const itemRows = items.map((item) => ({
        id: randomUUID(),
        prescription_id: prescriptionId,
        medication_id: item.medicationId,
        dose: item.dose || null,
        route: item.route || null,
        frequency: item.frequency || null,
        duration: item.duration || null,
        quantity: item.quantity || null,
        instructions: item.instructions ? encrypt(item.instructions) : null,
      }));

      await trx.withSchema('v2').from('prescription_items').insert(itemRows);

      return this.findById(prescriptionId, { trx });
    });
  }

  async update(id, updates) {
    const payload = { ...updates };
    if (payload.notes) {
      payload.notes = encrypt(payload.notes);
    }
    await db.withSchema('v2').from('prescriptions').where({ id }).update(payload);
    return this.findById(id);
  }
}

module.exports = { PrescriptionsRepository };
