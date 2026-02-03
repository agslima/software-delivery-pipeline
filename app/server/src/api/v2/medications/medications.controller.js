const { MedicationsService } = require('../../../core/v2/medications.service');
const { MedicationsRepository } = require('../../../infra/v2/medications.repository');

const service = new MedicationsService({
  medicationsRepository: new MedicationsRepository(),
});

exports.search = async (req, res, next) => {
  try {
    const results = await service.search(req.query.query, req.query.limit);
    return res.json({ results });
  } catch (err) {
    return next(err);
  }
};
