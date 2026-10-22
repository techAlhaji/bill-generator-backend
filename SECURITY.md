# Security Policy

## 1. Supported Versions

Security patches and vulnerability updates are actively provided for:

| Version | Status |
| :--- | :--- |
| `1.0.x` | Supported (Active Production & Testnet) |
| `< 1.0.0` | Unsupported |

---

## 2. Testnet & Cryptographic Scope

> [!WARNING]
> **Testnet Notice:** This backend service connects by default to the **Stellar Testnet** (`https://horizon-testnet.stellar.org` and `https://soroban-testnet.stellar.org`). Do not configure production mainnet private keys or server signer keys in non-production environments.

---

## 3. Reporting a Vulnerability

If you discover a vulnerability in the payment verification engine, authentication mechanisms, token validation, or database access layers, please notify us immediately through private disclosure.

### How to Report
- **Contact:** [`ademolabuild@gmail.com`](mailto:ademolabuild@gmail.com)
- **Subject:** `[SECURITY] StellarBills Backend Vulnerability Report`
- **Details to Provide:**
  - Route or module affected (e.g. `src/modules/payment/service.ts`).
  - Clear vulnerability description (e.g. replay attack, timing vulnerability, bypass of payment verification).
  - Minimal reproducible example or HTTP request curl command.
  - Potential impact assessment.

### SLA & Response Timeline
- **Acknowledgement:** Within 48 hours.
- **Triage & Remediation Plan:** Within 5 business days.
- **Fix Deployment:** Critical vulnerabilities are patched within 24-72 hours of triage.

Please do **not** file public GitHub issues for security vulnerabilities.
