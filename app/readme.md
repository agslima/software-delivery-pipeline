

StayHealthy Prescription Portal

Internal Engineering Documentation


---

1. Purpose & Scope

The StayHealthy Prescription Portal is an internal full-stack system designed to demonstrate and validate enterprise-grade application patterns for digital prescription workflows.

The system provides:

Read-only access to prescription records

Secure authentication and authorization

A web-based user interface for viewing and printing prescriptions

A RESTful API suitable for integration with downstream systems


> Important:
This application is not intended for real clinical use, does not handle live patient data, and does not claim regulatory compliance (e.g., HIPAA, GDPR). It serves as a reference implementation for architecture, security, and operational patterns.




---

2. System Overview

The platform replaces paper-based prescriptions with a digitally verifiable representation accessible through a Single Page Application (SPA) backed by a stateless API.

Primary goals:

Demonstrate clean separation between presentation, API, and persistence layers

Enforce authentication and request-level security controls

Provide a deployable, containerized environment suitable for internal evaluation and iteration



---

3. High-Level Architecture

The system is composed of three primary components:

1. Frontend (Client)

React-based Single Page Application

Served as static assets via Nginx

Proxies API requests to the backend



2. Backend (Server)

Stateless Node.js / Express API

Handles authentication, request validation, and business logic

Exposes REST endpoints under /api/v1



3. Database

PostgreSQL instance

Persistent storage for prescription and user data

Managed via Knex.js migrations




graph LR
    User -->|HTTPS :4173| Nginx

    subgraph Frontend
        Nginx --> React
    end

    subgraph Backend
        API[Node.js API :8080]
    end

    subgraph Database
        DB[(PostgreSQL :5432)]
    end

    Nginx -->|/api/*| API
    API --> DB


---

4. Technology Stack

Frontend

React 18

Vite

Nginx (static hosting + reverse proxy)


Backend

Node.js (>= 18)

Express

Knex.js (SQL query builder & migrations)


Database

PostgreSQL 15


Infrastructure

Docker

Docker Compose

Multi-stage builds


Quality & Tooling

ESLint v9

Prettier

Jest (unit & integration tests)

OpenAPI 3.0 (Swagger)



---

5. Security Model (Application-Level)

The application implements baseline security controls appropriate for internal systems and reference architectures.

Authentication

Username/password authentication

Credentials validated server-side

JWT issued upon successful authentication


Authorization

Protected routes enforced via middleware

Bearer token required for prescription access


Transport & Headers

Content Security Policy (CSP) enforced

Security headers applied at the application layer

Reverse proxy reduces CORS complexity


Abuse Protection

Rate limiting applied to API endpoints


> Out of Scope:

Role-based access control (RBAC)

Token rotation / refresh flows

Fine-grained audit logging

Compliance certifications





---

6. Configuration & Environment

All runtime configuration is environment-driven.

Example .env (non-production):

NODE_ENV=production
PORT=8080
LOG_LEVEL=info

DB_USER=app_user
DB_PASS=secure_db_password
DB_NAME=prescriptions_db

JWT_SECRET=change_this_value
ADMIN_USER=admin
ADMIN_PASS=SuperSecurePassword123!
CORS_ORIGIN=http://localhost:4173

> Note:
Default credentials are provided for demonstration purposes only and must not be used in real environments.




---

7. API Documentation

The backend exposes a documented REST API.

OpenAPI 3.0 specification

Swagger UI available at:


/api/v1/api-docs

The API contract is intended to be:

Predictable

Versioned

Suitable for internal consumers and automated testing



---

8. Deployment Model

The system is deployed using Docker Compose, enabling reproducible local and CI environments.

Start All Services

docker-compose up --build

Exposed Services

Service	Address

Web UI	http://localhost:4173
API	http://localhost:4173/api/v1
API Docs	http://localhost:4173/api/v1/api-docs



---

9. Database Management

Schema management is handled via Knex migrations.

Typical workflows:

# Apply migrations
npm run db:migrate

# Seed demo data
npm run db:seed

Migrations are:

Version-controlled

Deterministic

Executed automatically in containerized environments



---

10. Development & Quality Standards

Linting

# Backend
cd server && npm run lint

# Frontend
cd client && npm run lint

Testing

Jest used for unit and integration tests

API endpoints validated via Supertest

Authentication and middleware tested in isolation



---

11. Non-Goals

This system does not aim to:

Serve as a certified medical record system

Handle real patient data

Provide regulatory compliance guarantees

Replace enterprise IAM or audit platforms



---

12. License

Licensed under the Apache 2.0 License.
See the LICENSE file for details.


---

Final Note

This repository should be treated as:

> An internal reference implementation showcasing production-oriented patterns, not a clinical product.



