const { DoctorsService } = require('../../../core/v2/doctors.service');
const { DoctorsRepository } = require('../../../infra/v2/doctors.repository');

const service = new DoctorsService({
  doctorsRepository: new DoctorsRepository(),
});

exports.getMe = async (req, res, next) => {
  try {
    const doctor = await service.getMe(req.user.sub);
    return res.json(doctor);
  } catch (err) {
    return next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const doctor = await service.getById({ doctorId: req.params.id, requester: req.user });
    return res.json(doctor);
  } catch (err) {
    return next(err);
  }
};
