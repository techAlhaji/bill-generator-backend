#!/usr/bin/env bash
# scripts/create_issues.sh
# Automates bulk issue creation for techAlhaji/bill-generator-backend using GitHub CLI (gh)

set -e

REPO="techAlhaji/bill-generator-backend"

echo "Creating labels on $REPO..."
gh label create "complexity:low" --repo "$REPO" --color "0E8A16" --description "Good for newcomers, < 2 hours" --force || true
gh label create "complexity:medium" --repo "$REPO" --color "FBCA04" --description "Moderate complexity, 2-5 hours" --force || true
gh label create "complexity:high" --repo "$REPO" --color "D93F0B" --description "High complexity architectural task, > 5 hours" --force || true
gh label create "type:feat" --repo "$REPO" --color "1D76DB" --description "New feature or capability" --force || true
gh label create "type:test" --repo "$REPO" --color "C5DEF5" --description "Test coverage expansion" --force || true
gh label create "type:docs" --repo "$REPO" --color "5319E7" --description "Documentation and guides" --force || true
gh label create "type:refactor" --repo "$REPO" --color "F9D0C4" --description "Code refactoring and optimization" --force || true
gh label create "type:ci" --repo "$REPO" --color "BFD4F2" --description "CI/CD and automation" --force || true

echo "Creating planned issues on $REPO..."

# Issue 1
gh issue create --repo "$REPO" \
  --title "feat(backend): implement automated merchant webhook dispatch on payment verification" \
  --label "complexity:medium,type:feat" \
  --body "### Summary
Allow merchants to register a webhook URL in settings. Upon successful cryptographic payment verification (Horizon or Soroban), dispatch an HMAC-SHA256 signed HTTP POST payload to the merchant's endpoint.

### Acceptance Criteria
- [ ] Add \`webhookUrl\` and \`webhookSecret\` fields to Merchant Prisma model.
- [ ] Implement asynchronous webhook delivery service with exponential backoff retry (3 attempts).
- [ ] Include \`X-StellarBills-Signature\` header containing HMAC-SHA256 digest of payload.
- [ ] Add unit and mock integration test verifying webhook delivery.

### Tech Stack
- Fastify v5, Prisma ORM, Node.js crypto"

# Issue 2
gh issue create --repo "$REPO" \
  --title "feat(backend): add recurring invoice scheduling cron runner" \
  --label "complexity:high,type:feat" \
  --body "### Summary
Implement automated recurring billing schedules (weekly, monthly, quarterly, annual) where new draft or issued invoices are generated from templates on schedule.

### Acceptance Criteria
- [ ] Add \`RecurringSchedule\` model in Prisma linked to template invoice.
- [ ] Implement scheduling runner using a lightweight cron worker.
- [ ] Ensure unique constraint prevents double-generation for the same billing period.
- [ ] Add endpoint \`GET /api/v1/schedules\` and \`POST /api/v1/schedules\`.

### Tech Stack
- TypeScript, Prisma, Fastify"

# Issue 3
gh issue create --repo "$REPO" \
  --title "feat(backend): add CSV and Excel accounting export endpoint for merchant invoices" \
  --label "complexity:low,type:feat" \
  --body "### Summary
Add \`GET /api/v1/invoices/export\` allowing merchants to download a structured CSV or XLSX report of invoices filtered by date range and status for tax and accounting reconciliation.

### Acceptance Criteria
- [ ] Support query parameters \`startDate\`, \`endDate\`, \`status\`, and \`format=csv|xlsx\`.
- [ ] Formats stroops / minor units into standard decimal representations accurately without floating point rounding error.
- [ ] Return appropriate \`Content-Type: text/csv\` or \`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\`.
- [ ] Add unit test verifying CSV header and line item mapping.

### Tech Stack
- Node.js streams, Fastify"

# Issue 4
gh issue create --repo "$REPO" \
  --title "test(backend): expand mock Horizon edge-case tests for multi-operation payment bundles" \
  --label "complexity:medium,type:test" \
  --body "### Summary
Expand the payment verification test suite to simulate edge-case Stellar transaction envelopes containing multiple operations (e.g. merge + payment, path payments, or sponsored reserves) to ensure the payment parser strictly isolates the matching invoice operation.

### Acceptance Criteria
- [ ] Add mock transaction envelope with 5 different operations including the target payment.
- [ ] Test scenario where destination matches but amount is short by 1 stroop (assert rejection).
- [ ] Test scenario where asset code matches but issuer address differs (assert rejection).
- [ ] Test replay prevention with duplicate transaction hash submission.

### Tech Stack
- Vitest, @stellar/stellar-sdk"

# Issue 5
gh issue create --repo "$REPO" \
  --title "refactor(backend): introduce Redis cache layer for capability URL rate-limiting and public token lookup" \
  --label "complexity:medium,type:refactor" \
  --body "### Summary
Add an optional Redis caching adapter to cache public capability token lookups (\`/pay/:token\`) and enforce distributed rate limiting across multiple backend instances.

### Acceptance Criteria
- [ ] Provide Redis client wrapper with fallback to in-memory cache if \`REDIS_URL\` is undefined.
- [ ] Cache sanitized public invoice JSON with 5-second TTL (cleared immediately on status change).
- [ ] Configure Fastify rate limit plugin backed by Redis.

### Tech Stack
- Fastify, ioredis, TypeScript"

# Issue 6
gh issue create --repo "$REPO" \
  --title "feat(backend): support multi-currency exchange rate snapshots via SEP-38 quote endpoint" \
  --label "complexity:high,type:feat" \
  --body "### Summary
Integrate Anchor SEP-38 price quotes to display estimated local fiat conversion equivalents for stablecoins (e.g. USDC -> BRL, EURC, or NGN) during public payer view.

### Acceptance Criteria
- [ ] Implement SEP-38 Anchor directory discovery client.
- [ ] Fetch indicative exchange rate snapshots without blocking invoice rendering.
- [ ] Display quote with timestamp and source attribution.

### Tech Stack
- TypeScript, Stellar SEP-38 standard"

# Issue 7
gh issue create --repo "$REPO" \
  --title "docs(backend): generate interactive Swagger UI from openapi.yaml" \
  --label "complexity:low,type:docs" \
  --body "### Summary
Serve an interactive Swagger UI documentation portal directly at \`GET /docs\` using \`@fastify/swagger\` and \`@fastify/swagger-ui\` loading the existing \`openapi.yaml\` specification.

### Acceptance Criteria
- [ ] Register \`@fastify/swagger\` and \`@fastify/swagger-ui\` in development and staging environments.
- [ ] Mount UI at \`/docs\` with route inspection and test execution.
- [ ] Verify all routes and RFC 7807 problem details render correctly.

### Tech Stack
- Fastify, OpenAPI 3.0"

# Issue 8
gh issue create --repo "$REPO" \
  --title "ci(backend): add Prisma schema validation and migration check to GitHub Actions" \
  --label "complexity:low,type:ci" \
  --body "### Summary
Enhance \`.github/workflows/ci.yml\` to run \`prisma validate\` and verify that no uncommitted migrations exist before executing the integration test suite.

### Acceptance Criteria
- [ ] Add \`npx prisma validate\` step in CI workflow.
- [ ] Add check ensuring \`prisma migrate diff\` detects zero drift against active schema.
- [ ] Test on pull requests.

### Tech Stack
- GitHub Actions, Prisma"

echo "All planned issues successfully created for $REPO!"
