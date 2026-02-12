const { PrescriptionsService } = require('../../../core/prescriptions/prescriptions.service');
const { PrescriptionsRepository } = require('../../../infra/prescriptions/prescriptions.repository');

const service = new PrescriptionsService(new PrescriptionsRepository());

exports.getPrescription = async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
