class MedicationsService {
  constructor({ medicationsRepository }) {
    this.medicationsRepository = medicationsRepository;
  }

  async search(query, limit) {
    return this.medicationsRepository.search(query, limit);
  }
}

module.exports = { MedicationsService };
