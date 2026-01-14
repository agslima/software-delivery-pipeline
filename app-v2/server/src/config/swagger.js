const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Secure Prescription API',
      version: '1.0.0',
      description: 'Production-ready API with JWT Auth and rate limiting',
      contact: {
        name: 'API Support',
        email: 'support@stayhealthy.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080/api/v1',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/modules/**/*.routes.js', './src/modules/**/*.schema.js'], 
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;