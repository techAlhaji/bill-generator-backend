<p align="center">
  <img src="https://raw.githubusercontent.com/techAlhaji/bill-generator-frontend/main/public/images/banner.png" alt="StellarBills Logo" width="640" onerror="this.style.display='none'" />
</p>

<h1 align="center">StellarBills — Backend REST API</h1>

<p align="center">
  <strong>Production-grade Fastify TypeScript backend engine, cryptographic payment verification service, and PDF invoicing pipeline for Stellar.</strong>
</p>

<p align="center">
  <a href="https://github.com/techAlhaji/bill-generator-backend/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/techAlhaji/bill-generator-backend/ci.yml?branch=main&label=CI%20Build" alt="CI Build" />
  </a>
  <img src="https://img.shields.io/badge/Node.js-v24%2B-green.svg" alt="Node.js v24+" />
  <img src="https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg" alt="TypeScript 5.7+" />
  <img src="https://img.shields.io/badge/Fastify-v5-black.svg" alt="Fastify v5" />
  <img src="https://img.shields.io/badge/Prisma-ORM-teal.svg" alt="Prisma ORM" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue.svg" alt="PostgreSQL 16" />
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-Apache%202.0-green.svg" alt="License" />
  </a>
</p>

---

## 1. What is StellarBills Backend?

The **StellarBills Backend API** powers commercial invoicing, CRM directory management, PDF generation, and automated cryptographic payment reconciliation on Stellar. 

### Core Architectural Capabilities
- **Hybrid Cryptographic Payment Verification:** Zero-trust payment verification connecting directly to **Stellar Horizon** (for Stellar Classic payments) and **Soroban RPC** (for Protocol 22 smart contract payments). Frontend payment confirmation signals are never trusted.
- **Zero Floating-Point Arithmetic:** All quantities are scaled by integer factor $10^4$ and prices/balances are stored strictly in integer base minor units (stroops or cents) using native `BigInt` to eliminate rounding errors.
- **RFC 8785 Canonical Hashing:** Computes deterministic SHA-256 digests of canonical invoice JSON matching on-chain Soroban commitments.
- **Tamper-Evident Vector PDF Invoices:** Built-in PDFKit vector generator rendering print-ready commercial invoices with embedded QR codes and payment metadata.
- **RFC 7807 Problem Details:** Unified `application/problem+json` error reporting across all endpoints.

---

## 2. Maintainers

| Avatar | Maintainer | Role | Contact |
| :---: | :--- | :--- | :--- |
| <img src="https://github.com/techAlhaji.png" width="48" height="48" style="border-radius:50%;" /> | **Ademola (@techAlhaji)** | Lead Backend Engineer | [`ademolabuild@gmail.com`](mailto:ademolabuild@gmail.com) / GitHub: [@techAlhaji](https://github.com/techAlhaji) |

---

## 3. Technology Stack & Architecture

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **HTTP Framework** | Fastify v5 | Schema validation, Helmet security headers, CORS, rate-limiting, Pino logging |
| **Database & ORM** | PostgreSQL 16 + Prisma | ACID serializable transactions, row-level locks, replay prevention |
| **Authentication** | JWT & Stellar SEP-10 | Dual authentication supporting password or Web3 cryptographic wallet challenges |
| **Blockchain Clients** | `@stellar/stellar-sdk` | Horizon REST client, Soroban RPC client, XDR transaction decoders |
| **Validation** | Zod v3 | Strict boundary validation for addresses, hashes, UUIDs, and quantities |
| **Testing** | Vitest | Integration and unit testing with native TypeScript execution |

---

## 4. Key API Endpoints

The API is fully documented in [`openapi.yaml`](./openapi.yaml):

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Merchant onboarding with email or Stellar address |
| `POST` | `/api/v1/auth/login` | Public | Standard JWT credentials authentication |
| `POST` | `/api/v1/auth/challenge` | Public | Initiates non-custodial SEP-10 wallet challenge |
| `POST` | `/api/v1/auth/verify-challenge` | Public | Verifies wallet signature and issues session |
| `GET` | `/api/v1/invoices` | Protected | Lists merchant invoices with filters and pagination |
| `POST` | `/api/v1/invoices` | Protected | Creates draft invoice with line items and math validation |
| `POST` | `/api/v1/invoices/:id/issue` | Protected | Issues invoice, creates capability URL, anchors hash |
| `GET` | `/api/v1/invoices/:id/pdf` | Protected | Generates high-resolution vector PDF invoice |
| `GET` | `/api/v1/public/invoices/:token` | Public | Sanitized payer view (scrubs internal IDs & notes) |
| `POST` | `/api/v1/public/invoices/:token/verify-payment` | Public | Cryptographic payment settlement verification |

---

## 5. Quick-Start & Local Setup

### Prerequisites
- Node.js v22+ or v24+
- PostgreSQL 15+ (local or containerized)

```bash
# 1. Clone repository
git clone https://github.com/techAlhaji/bill-generator-backend.git
cd bill-generator-backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Update DATABASE_URL in .env: postgresql://user:password@localhost:5432/bill_generator

# 4. Run Prisma database migrations
npm run prisma:generate
npm run prisma:migrate:dev

# 5. Start development server
npm run dev

# 6. Run test suite
npm test
```

---

## 6. Directory Structure

```
bill-generator-backend/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated build, PostgreSQL service, migrate & test
├── docs/
│   ├── INTEGRATION_SPEC.md      # Detailed REST API specification
│   └── PAYMENT_VERIFICATION_DESIGN.md # Zero-trust cryptographic verification guide
├── prisma/
│   ├── schema.prisma            # Relational PostgreSQL schema
│   └── migrations/              # Applied SQL migrations
├── scripts/
│   └── create_issues.sh         # gh script for automated community issue creation
├── src/
│   ├── config/                  # Environment validation
│   ├── db/                      # PrismaClient singleton & BigInt serializer
│   ├── errors/                  # RFC 7807 problem details
│   ├── logger/                  # Pino structured logging
│   ├── modules/
│   │   ├── auth/                # Dual auth (Password & SEP-10)
│   │   ├── clients/             # CRM client directory
│   │   ├── invoices/            # Invoicing state machine & canonical hash
│   │   ├── merchant/            # Merchant profile & settings
│   │   ├── payment/             # Hybrid Horizon & Soroban verification
│   │   └── public/              # Sanitized public payer capability portal
│   ├── routes/                  # Route declarations (/api/v1)
│   ├── stellar/                 # Horizon and Soroban RPC clients
│   └── utils/                   # Zero-float math, canonical hashing, PDFKit
├── openapi.yaml                 # Complete OpenAPI 3.0.3 specification
├── CONTRIBUTING.md              # Issue claiming workflow (.take) and guidelines
├── SECURITY.md                  # Responsible disclosure policy and disclaimer
└── README.md
```

---

## 7. Contributing & Security

- **Contributing:** Read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting code. We enforce `.take` issue assignments and conventional commits.
- **Security:** Review [SECURITY.md](./SECURITY.md) for vulnerability reporting procedures.

---

## 8. Contributors

Thanks to all contributors building with StellarBills!

<a href="https://github.com/techAlhaji/bill-generator-backend/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=techAlhaji/bill-generator-backend" alt="Contributors" />
</a>

---

## 9. License

This repository is licensed under the [Apache License 2.0](./LICENSE).
