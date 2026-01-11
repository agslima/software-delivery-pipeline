```text
app/
│
├── server/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   │
│   │   ├── config/
│   │   │   ├── env.js
│   │   │   ├── helmet.js
│   │   │   └── rateLimit.js
│   │   │
│   │   ├── modules/
│   │   │   └── prescription/
│   │   │       ├── prescription.controller.js
│   │   │       ├── prescription.service.js
│   │   │       ├── prescription.routes.js
│   │   │       └── prescription.schema.js
│   │   │
│   │   ├── middlewares/
│   │   │   ├── errorHandler.js
│   │   │   ├── requestLogger.js
│   │   │   └── auth.js
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.js
│   │   │   └── response.js
│   │   │
│   │   └── routes.js
│   │
│   ├── tests/
│   └── package.json
│
├── client/
│   ├── src/
│   ├── dist/
│   ├── index.html
│   └── vite.config.js
│
├── docker/
│   ├── Dockerfile.server
│   └── Dockerfile.client
│
├── .env.example
├── docker-compose.yml
└── README.md
```
