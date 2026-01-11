const PrescriptionService = require('./prescription.service');

exports.getPrescription = async (req, res, next) => {
  try {
    const data = await PrescriptionService.getById(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
