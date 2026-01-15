const YAML = require('yamljs');
const path = require('path');

const openApiPath = path.join(__dirname, '../../docs/openapi.yaml');

// Load the YAML file directly
const swaggerDocument = YAML.load(openApiPath);

module.exports = swaggerDocument;