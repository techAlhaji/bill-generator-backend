# Stellar Bill Generator — Backup, Migration, and Disaster Recovery Procedures

**Document Version:** 1.0.0  
**Target Environment:** Stellar Testnet Release (Controlled Public Preview)  
**Applicable Scope:** `bill-generator-backend`, `bill-generator-frontend`, `bill-generator-contracts`  
**Security Classification:** Operational Runbook  

---

## 1. PostgreSQL Database Backup Procedures

The database holds all merchant profiles, client directories, invoice lifecycle states, audit logs, and cryptographic hashes. All monetary amounts are recorded as integer minor units (`BigInt`).

### 1.1 Automated Daily Snapshot & Continuous WAL Archiving

1. **Logical Backup (`pg_dump`):**
   ```bash
   # Scheduled nightly via cron at 02:00 UTC
   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   BACKUP_DIR="/var/backups/postgres"
   mkdir -p ${BACKUP_DIR}

   # Create compressed, consistent snapshot with ACID isolation
   pg_dump \
     --format=custom \
     --compress=9 \
     --no-owner \
     --no-privileges \
     --dbname="${DATABASE_URL}" \
     --file="${BACKUP_DIR}/stellar_bills_${TIMESTAMP}.dump"
   ```

2. **Offsite Replication:**
   - Encrypt backup snapshots using GPG / AES-256 before uploading to encrypted S3 / Cloud Storage with Object Lock (WORM policy):
     ```bash
     gpg --symmetric --cipher-algo AES256 ${BACKUP_DIR}/stellar_bills_${TIMESTAMP}.dump
     aws s3 cp ${BACKUP_DIR}/stellar_bills_${TIMESTAMP}.dump.gpg s3://stellar-bills-backups/testnet/
     ```
   - Retain daily backups for 30 days; weekly backups for 90 days.

3. **Physical / WAL Archiving (Point-in-Time Recovery - PITR):**
   - For managed databases (e.g., AWS RDS PostgreSQL / Supabase / Neon): Enable Automated Backups with 7-day PITR retention.
   - For self-hosted instances: Enable `wal_level = replica` and `archive_mode = on` using `pgBackRest` or `wal-g`.

---

## 2. Database Migration & Rollback Procedures

All database migrations are maintained through Prisma declarative migration files in `prisma/migrations/`.

### 2.1 Production Migration Deployment

1. **Pre-flight Checks:**
   - Verify active database connectivity:
     ```bash
     npm run prisma:deploy -- --dry-run
     ```
   - Verify pending migrations:
     ```bash
     npx prisma migrate status
     ```

2. **Applying Migrations:**
   - Execute in the release phase / CI deploy container:
     ```bash
     npm run prisma:deploy
     ```
   - `prisma migrate deploy` only executes pending, unapplied migrations and never modifies or resets existing table data.

3. **Migration Failure Mitigation:**
   - If a migration fails mid-way, Prisma marks it as `failed` in the `_prisma_migrations` table.
   - **Resolution procedure:**
     ```bash
     # Inspect the specific failed step
     npx prisma migrate status

     # Roll forward with a targeted fix, then mark resolved
     npx prisma migrate resolve --rolled-back "2026XXXXXXXXXX_failed_migration"
     ```

---

## 3. Disaster Recovery & Restoration Runbook

### 3.1 Scenario: Database Corruption or Data Loss

1. **Isolate Traffic:**
   - Put backend into maintenance mode by returning HTTP 503 from the reverse proxy (Cloudflare / Nginx).
2. **Provision Target Instance:**
   - Spin up a fresh PostgreSQL 16+ instance.
3. **Restore from Snapshot:**
   ```bash
   # Decrypt snapshot
   gpg --decrypt stellar_bills_2026XXXX_XXXXXX.dump.gpg > restore.dump

   # Restore into fresh database
   pg_restore \
     --clean \
     --if-exists \
     --no-owner \
     --no-privileges \
     --dbname="${NEW_DATABASE_URL}" \
     restore.dump
   ```
4. **Run Prisma Validation:**
   ```bash
   npx prisma migrate status
   npm test
   ```
5. **Resume Traffic:** Point backend `DATABASE_URL` to the restored instance and redeploy.

### 3.2 Scenario: Stellar Horizon or Soroban RPC Outage

1. **Behavior During Outage:**
   - The backend `/health/ready` probe will indicate `horizon: "error"` or `sorobanRpc: "error"`.
   - Existing draft and invoice authoring remains fully operational.
   - Payer payment submissions will fail gracefully with RFC 7807 problem details (`502 Bad Gateway` / `503 Service Unavailable`).
2. **Automated Recovery:**
   - Once RPC nodes resume connectivity, the Background Reconciliation Worker (`reconciliationService`) automatically re-verifies any pending invoices and clears consecutive failure counters.
   - Idempotency guarantees prevent any duplicate crediting or payment replay.

---

## 4. Key Management & Secret Rotation

| Credential / Secret | Purpose | Rotation Frequency | Rotation Procedure |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Signing merchant session tokens | Every 90 days | Set dual-secret verification support, update environment variable, and redeploy. |
| `SERVER_SIGNER_SECRET_KEY` | SEP-10 challenge signing | As needed | Generate new Stellar keypair, update DNS `stellar.toml` `SIGNING_KEY`, and update `.env`. |
| `DATABASE_URL` Password | PostgreSQL auth | Every 180 days | Update password in Postgres, update secrets manager, and trigger rolling deployment. |

All secrets in logs are automatically redacted via the Pino logging configuration in `src/logger/index.ts`.
