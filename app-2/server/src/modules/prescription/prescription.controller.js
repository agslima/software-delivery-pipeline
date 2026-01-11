const PrescriptionService = require('./prescription.service');

exports.getPrescription = (req, res, next) => {
  try {
    const prescription = PrescriptionService.getById(req.params.id);
    res.status(200).json(prescription);
  } catch (err) {
    next(err);
  }
};
