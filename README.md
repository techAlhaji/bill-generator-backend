# Stellar Bill Generator — Backend REST API

Production-grade TypeScript & Node.js backend engine for the **Stellar Bill Generator** platform. Engineered for high-throughput invoice lifecycle management, RFC 8785 canonical content hashing, tamper-evident PDF generation, and hybrid cryptographic payment settlement verification across Stellar Classic L1 (Horizon) and Soroban Smart Contracts (Protocol 22 RPC).

---

## 1. Architecture & Technology Stack

| Domain | Technology Selection | Rationale & Architectural Decisions |
| :--- | :--- | :--- |
| **Runtime & Language** | **Node.js v24+ & TypeScript 5.7+** | Native ES modules (`"type": "module"`), strict static type checking, ECMAScript 2022+ primitives. |
| **HTTP Framework** | **Fastify v5** | Low-overhead, asynchronous request pipeline with plugins for CORS, Helmet security headers, rate limiting, and JWT authentication. |
| **Database & ORM** | **PostgreSQL 16+ & Prisma ORM** | Strict ACID transaction guarantees, row-level locks for payment verification, declarative migrations, and unique constraints for replay prevention. |
| **API Boundary Validation** | **Zod v3** | Strict schema validation on all inputs; custom regex for Stellar addresses (`G...`), transaction hashes, and UUIDs. |
| **Zero-Float Monetary Math** | **Native BigInt Minor Units** | Floating-point arithmetic is strictly prohibited. Quantities are scaled by $10^4$ and prices/balances are tracked in base minor units (stroops/cents). |
| **Canonical Hashing** | **RFC 8785 (JCS) & SHA-256** | Deterministic JSON canonicalization ensuring on-chain content digests match across heterogeneous environments. |
| **PDF Generation** | **PDFKit** | High-resolution, tamper-evident vector PDF invoice generation with payment metadata and status badges. |
| **Error Handling** | **RFC 7807 Problem Details** | Standardized `application/problem+json` error responses across all 4xx/5xx responses. |
| **Logging** | **Pino** | Structured JSON logging with automatic redacting of secrets, passwords, private keys, and authorization headers. |
| **Test Suite** | **Vitest** | Fast, modern automated testing with native TypeScript execution and in-memory Fastify request injection. |

---

## 2. Directory Structure

```
bill-generator-backend/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI (lint, build, migrate, test)
├── docs/
│   ├── INTEGRATION_SPEC.md      # Backend REST API integration specification
│   └── PAYMENT_VERIFICATION_DESIGN.md # Deep dive on verification engine & limitations
├── prisma/
│   ├── schema.prisma            # PostgreSQL relational schema
│   └── migrations/              # Applied SQL migrations
├── src/
│   ├── config/                  # Environment validation via Zod
│   ├── db/                      # PrismaClient singleton & BigInt JSON serialization
│   ├── errors/                  # RFC 7807 problem details error classes & handler
│   ├── logger/                  # Pino structured logging with redaction
│   ├── middlewares/             # JWT authentication hooks & merchant context
│   ├── modules/                 # Modular business logic domains
│   │   ├── auth/                # Password & Web3 SEP-10 authentication
│   │   ├── clients/             # Client CRM directory
│   │   ├── invoices/            # Invoice lifecycle state machine & numbering
│   │   ├── merchant/            # Merchant settings & profile
│   │   ├── payment/             # Cryptographic payment verification engine
│   │   └── public/              # Sanitized public payer capability portal
│   ├── routes/                  # Fastify route declarations (/api/v1)
│   ├── stellar/                 # Horizon and Soroban RPC clients & config
│   ├── utils/                   # Zero-float math, canonical hashing, PDF generator
│   ├── app.ts                   # Fastify app factory with plugin registrations
│   └── index.ts                 # Server entrypoint and graceful shutdown
├── tests/                       # Automated unit and integration test suite
│   ├── unit/                    # Monetary math, canonical hash, PDF tests
│   └── integration/             # Health, Auth, Clients, Invoices, Payment tests
├── .env.example                 # Example environment template with placeholders
├── openapi.yaml                 # Complete OpenAPI 3.0.3 specification
├── package.json
└── tsconfig.json
```

---

## 3. Local Development Setup

### 3.1 Prerequisites
- **Node.js:** v24.0.0 or higher
- **npm:** v10.0.0 or higher
- **PostgreSQL:** v15+ running locally (e.g. on `localhost:5432`)

### 3.2 Installation
```bash
# Clone and enter backend directory
cd bill-generator-backend

# Install dependencies
npm install
```

### 3.3 Environment Configuration
Copy the template environment file:
```bash
cp .env.example .env
```
Edit `.env` to configure your local PostgreSQL database URL and secrets:
```ini
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bill_generator?schema=public
JWT_SECRET=super-secret-development-jwt-key-replace-in-prod-min-32-chars
JWT_EXPIRES_IN=7d
STELLAR_NETWORK=TESTNET
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
INVOICE_REGISTRY_CONTRACT_ID=CCG6V5QEJZ2QI7EXIRVQXCHUIFUROXUBMZPTSCRJHOO35CAQ2HZ6IJGC
SERVER_SIGNER_SECRET_KEY=SC6WBWPGSIELKLKKRCY5GOIIF3JIJTS2GDKSJD7K6M6MHR3G3RI7EXYP
```

### 3.4 Database Migrations
Apply Prisma migrations to initialize database tables:
```bash
# Generate Prisma Client
npm run prisma:generate

# Apply migrations
npm run prisma:migrate
```

---

## 4. Running the Application

### 4.1 Development Server
Starts the Fastify server with hot-reload via `tsx`:
```bash
npm run dev
```
The server will boot at `http://localhost:4000`.

### 4.2 Production Build
```bash
# Compile TypeScript to JavaScript in dist/
npm run build

# Start production server
npm start
```

---

## 5. Automated Testing

The repository contains an automated test suite with **56 unit and integration tests** covering monetary mathematics, canonical RFC 8785 hashing, PDF rendering, authentication, client CRM, invoice state transitions, and payment verification with idempotency protection.

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with code coverage report
npm run test:coverage
```

---

## 6. API Documentation & Endpoints

The complete OpenAPI 3.0.3 specification is located in [`openapi.yaml`](./openapi.yaml) and served dynamically:
- Raw OpenAPI YAML: `GET http://localhost:4000/api/v1/openapi.yaml`

### Key Endpoint Groups

| Group | Method & Path | Access | Description |
| :--- | :--- | :--- | :--- |
| **Health** | `GET /health` | Public | Liveness probe (`{ "status": "ok" }`). |
| | `GET /health/ready` | Public | Readiness probe checking PostgreSQL, Horizon, and Soroban RPC. |
| **Auth** | `POST /api/v1/auth/register` | Public | Register merchant account (email, password, businessName, stellarAddress). |
| | `POST /api/v1/auth/login` | Public | Authenticate merchant credentials and receive signed JWT. |
| | `POST /api/v1/auth/stellar-challenge` | Public | Generate SEP-10 Web3 challenge transaction for Freighter. |
| | `POST /api/v1/auth/stellar-verify` | Public | Verify signed challenge transaction and issue session JWT. |
| **Merchant**| `GET /api/v1/merchant/profile` | Bearer JWT | Retrieve merchant profile and Stellar address settings. |
| | `PUT /api/v1/merchant/profile` | Bearer JWT | Update business name, receiving address, and branding. |
| **Clients** | `GET /api/v1/clients` | Bearer JWT | List merchant's clients with pagination and search. |
| | `POST /api/v1/clients` | Bearer JWT | Create new client record. |
| | `GET /api/v1/clients/:id` | Bearer JWT | Retrieve client details. |
| | `PUT /api/v1/clients/:id` | Bearer JWT | Update client contact information. |
| | `DELETE /api/v1/clients/:id` | Bearer JWT | Delete client (prohibited if active invoices exist). |
| **Invoices**| `GET /api/v1/invoices` | Bearer JWT | List invoices with status, client, and currency filters. |
| | `POST /api/v1/invoices` | Bearer JWT | Create draft invoice with zero-float integer calculations. |
| | `GET /api/v1/invoices/:id` | Bearer JWT | Get full invoice breakdown including line items and audit log. |
| | `PUT /api/v1/invoices/:id` | Bearer JWT | Update draft invoice (prohibited once issued or paid). |
| | `POST /api/v1/invoices/:id/issue` | Bearer JWT | Transition `DRAFT` $\to$ `ISSUED`, lock RFC 8785 hash. |
| | `POST /api/v1/invoices/:id/cancel` | Bearer JWT | Cancel invoice (prohibited if already paid). |
| | `GET /api/v1/invoices/:id/pdf` | Bearer JWT | Stream vector PDF invoice binary. |
| | `GET /api/v1/invoices/:id/payments` | Bearer JWT | Retrieve payment attempts and settlement history. |
| | `GET /api/v1/invoices/:id/audit-logs`| Bearer JWT | Immutable audit trail for invoice. |
| **Public** | `GET /api/v1/public/invoices/:token` | Capability | Sanitized invoice view (strips PII & merchant notes; 404 for drafts). |
| | `POST /api/v1/public/invoices/:token/verify-payment` | Capability | Cryptographically verify Stellar Classic / Soroban payment. |
| | `GET /api/v1/public/invoices/:token/status` | Capability | Lightweight status polling endpoint (`DRAFT`, `ISSUED`, `PAID`, `OVERDUE`). |
| | `GET /api/v1/public/invoices/:token/pdf` | Capability | Download public PDF invoice or payment receipt. |
