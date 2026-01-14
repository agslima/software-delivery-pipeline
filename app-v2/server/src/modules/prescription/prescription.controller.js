const PrescriptionService = require('./prescription.service');

// Instantiate the service (Dependency Injection Lite)
const prescriptionService = new PrescriptionService();

exports.getPrescription = async (req, res, next) => {
  try {
    // Call the instance method
    const data = await prescriptionService.getById(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
