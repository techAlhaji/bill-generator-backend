# Contributing to StellarBills Backend

Thank you for your interest in contributing to the **StellarBills Backend API**. This repository contains the high-throughput Fastify REST API, PostgreSQL database schema (Prisma ORM), RFC 8785 canonical content hashing engine, and hybrid cryptographic payment settlement verification service for Stellar Classic and Soroban smart contracts.

To maintain production standards, follow these guidelines.

---

## 1. Claiming an Issue

We follow an issue-first development workflow:
1. Browse open issues on the [Issues Tab](https://github.com/techAlhaji/bill-generator-backend/issues).
2. Comment `.take` on the unassigned issue you plan to implement.
3. Wait for assignment before starting.
4. Avoid submitting PRs without a corresponding linked issue.

### Complexity Tiers

| Label | Scope | Estimated Effort |
| :--- | :--- | :--- |
| `complexity:low` | Documentation updates, schema validation additions, test cases | < 2 hours |
| `complexity:medium` | Route handlers, Prisma queries, PDF template enhancements | 2–5 hours |
| `complexity:high` | Horizon/RPC payment verification engine, indexer synchronization, multi-sig | > 5 hours |

---

## 2. Local Development & Testing

### Prerequisites
- **Node.js:** `v22+` or `v24+`
- **npm:** `v10+`
- **PostgreSQL:** `v15+` (e.g. running on `localhost:5432`)

### Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your local PostgreSQL credentials

# 3. Generate Prisma client & apply migrations
npm run prisma:generate
npm run prisma:migrate:dev

# 4. Start local development server (port 4000)
npm run dev
```

### Local Verification Commands
Before submitting a pull request, verify:

```bash
# 1. Build TypeScript code (zero errors allowed)
npm run build

# 2. Run automated test suite
npm test
```

---

## 3. Engineering Constraints & Rules

1. **Zero Floating-Point Arithmetic:** Never use JavaScript `Number` for monetary amounts, unit prices, or balances. Use native `BigInt` or minor units integer strings (stroops for XLM, cents for fiat stablecoins). Quantities must be scaled by $10^4$ (`10000 = 1.0000`).
2. **Zero-Trust Settlement:** Frontend client signals are strictly untrusted for invoice payment transitions. Settlement must be independently validated against Stellar Horizon or Soroban RPC nodes.
3. **Canonical Hashing:** When hashing invoice contents for on-chain anchoring, strictly follow RFC 8785 (JSON Canonicalization Scheme) to prevent cross-platform digest mismatch.
4. **RFC 7807 Problem Details:** All API errors must return structured `application/problem+json` envelopes.
5. **Redacted Logging:** Never log private keys, passwords, database credentials, or Bearer tokens.

---

## 4. Git & Commit Guidelines

- **Branch Naming:**
  - `feat/issue-<number>-short-description`
  - `fix/issue-<number>-short-description`
- **Conventional Commits:**
  - `feat(backend): add webhook notification dispatcher for invoice payment`
  - `fix(backend): sanitize internal notes from capability payload`
  - `test(backend): add unit test for zero-float tax calculation`
- **Atomic Commits:** One logical commit per change. Do not batch unrelated fixes.

---

## 5. Pull Request Process

1. Open a Pull Request targeting the `main` branch.
2. Link the corresponding issue: `Closes #<issue_number>`.
3. Verify that the `Build, Migrate & Test` GitHub Actions CI job passes.
4. Respond to review comments promptly.
