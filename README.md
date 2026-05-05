# UC10 — AI Expense Report Auditor

> **Submit a receipt → AI audits it → tamper-evident decision in seconds.**
> Five-stage AI pipeline (OCR · duplicate · anomaly · policy · confidence) with a SHA-256 hash-chained audit log.

**Hackathon:** Amnex Infotechnologies — Sarjan (April 2026) · **Team:** TransitCoders · **Use case:** UC10 — Artificial Intelligence Expense Report Auditor with Policy Compliance · **License:** [MIT](LICENSE)

---

## TL;DR — try it in 90 seconds

```bash
cp .env.example .env                       # OpenAI key optional — stubs work end-to-end
docker compose up --build -d
# Web:      http://localhost:4200
# Swagger:  http://localhost:8080/swagger
# Login:    customer@demo.local / Customer@123
```

Upload any sample receipt → see the AI Audit Summary → log in as `admin@demo.local / Admin@123` to see it in the review queue, audit log, and chain verifier.

---

## What it does

An employee submits a receipt through the **Angular web app** or the **React Native mobile app**. The **.NET 8 backend** runs a five-stage pipeline in parallel:

1. **Optical Character Recognition (OCR)** — GPT-4o Vision extracts vendor, GSTIN, date, total, line items
2. **Duplicate detection** — perceptual hash (`CoenM.ImageHash`) compared against a 90-day rolling window
3. **Anomaly detection** — z-score baseline against the user's spend profile
4. **Policy rule engine** — deterministic rules (amount caps, GSTIN-required, blocked categories) + LLM-evaluated fuzzy rules
5. **Confidence aggregator** — weighted average (0.30 OCR / 0.20 duplicate / 0.20 anomaly / 0.30 policy)

Output is `Approved` / `Needs Review` / `Rejected` with a plain-language explanation. Low-confidence claims go to a human reviewer in the admin dashboard. **Every module invocation is appended to a SHA-256 hash-chained audit log** backed by a Postgres stored procedure that runs at SERIALIZABLE isolation — `GET /api/admin/audit-logs/verify-chain` replays the chain from genesis and reports any tampering.

Stub AI services ship with the codebase, so the demo runs end-to-end **without an OpenAI key**. Plugging a real key in `.env` enables live GPT-4o + GSTIN registry lookups behind Polly resilience policies (retry + timeout + circuit breaker).

---

## Repo layout

```
backend/             .NET 8 Web API — clean architecture (Api / Application / Domain / Infrastructure / Tests)
frontend/            Angular 19 SPA — admin + employee + theme toggle (Tailwind CSS)
Mobile/              React Native (Expo) — employee receipt capture
database/init/       Postgres schema, indexes, stored procedures, seed data (idempotent)
demo-data/           Sample receipts for smoke tests
docker-compose.yml         Local dev compose (Postgres exposed on :5432 for native dotnet-run)
docker-compose.prod.yml    Portal-compliant compose (single ${PORT} → nginx → backend)
.env.example         Copy to .env, fill local secrets (gitignored)
.env.prod            Committed placeholders for portal deploy (no real secrets)
FRS.md               Functional Requirements Specification
LICENSE              MIT
```

## Tech stack

| Layer | Choice |
|---|---|
| Web framework | ASP.NET Core 8 Web API (clean architecture: Api / Application / Domain / Infrastructure / Tests) |
| Persistence | Entity Framework Core 8 + Npgsql with custom enum mappings |
| Database | PostgreSQL 16 (init SQL + stored procedures + `pgcrypto`) |
| Auth | JWT HS256 + `BCrypt.Net-Next` + role-based authorization |
| Validation | FluentValidation (auto-validation, 400 ProblemDetails on bad input) |
| Logging | Serilog (structured, `UseSerilogRequestLogging`) |
| Resilience | Polly 8 (retry + timeout + circuit breaker) — wraps OpenAI + GSTIN HTTP clients |
| AI | OpenAI GPT-4o Vision + text · stub services when `OpenAI__ApiKey` is blank |
| Image hashing | `SixLabors.ImageSharp` + `CoenM.ImageSharp.ImageHash` (64-bit perceptual hash) |
| CSV export | `CsvHelper` |
| Web SPA | Angular 19 (standalone, signals) + Tailwind CSS + `ng-apexcharts` + light/dark theme |
| Mobile | React Native (Expo) |
| Orchestration | Docker Compose — `docker-compose.yml` for native-dev, `docker-compose.prod.yml` for portal-style deploy |

## Prerequisites

- Windows 11 with Docker Desktop
- .NET 8 SDK, Node 20+ (Node 24 works with warnings), bash (Git Bash / WSL) or PowerShell

## Quick start — Docker Compose (recommended)

```bash
cp .env.example .env
# Optionally set OpenAI__ApiKey in .env; leave blank to use deterministic stub AI services.
docker compose up --build -d
```

Services come up at:
- **Postgres** — `localhost:5432` (user `uc10`, db `uc10`)
- **Backend API** — http://localhost:8080 (health: `/health`, Swagger: `/swagger`)
- **Angular web** — http://localhost:4200

## Quick start — local dev (hot reload)

```bash
# 1. Postgres only
docker compose up -d postgres

# 2. Backend
cd backend
dotnet run --project src/Uc10.Api/Uc10.Api.csproj --urls http://localhost:8080

# 3. Angular dev server
cd frontend
npm install   # once
npm start     # → http://localhost:4200
```

## Demo users (seeded + idempotently re-applied at backend startup)

| Email | Password | Role |
|---|---|---|
| `admin@demo.local` | `Admin@123` | admin (full access) |
| `compliance@demo.local` | `Compliance@123` | compliance (thresholds, policy rules, audit export) |
| `analyst@demo.local` | `Analyst@123` | analyst (review queue) |
| `customer@demo.local` | `Customer@123` | customer (submit claims, see own decisions) |

> **Demo credentials only — never ship these bcrypt hashes outside the hackathon.**
> A `DemoUserSeeder` hosted service re-applies these on every backend start, so they survive volume reuse on the portal.

## End-to-end smoke test

```bash
./scripts/smoke.sh   # bash
# or
pwsh scripts/smoke.ps1   # PowerShell
```

Both scripts: log in → upload `demo-data/sample-receipts/tinyreceipt.jpg` → poll decision → verify audit chain.

## Tests

```bash
cd backend
dotnet test Uc10.sln
```

Meaningful targets:
- `PolicyRuleEngineTests` — each rule type evaluated on fixtures
- `ConfidenceAggregatorTests` — weighted average + threshold behavior
- `AuditHashChainTests` — genesis + 3 appended rows + tamper detection via `fn_verify_audit_chain`
- `ReferenceIdTests` — `EXP-YYYY-MM-XXXX-XXXX` format validation

## API surface

### Auth
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me               (any authenticated role)
```

### Expenses
```
POST /api/expenses                     (multipart: receipt=<file>)
POST /api/expenses/{id}/receipt        (re-attach receipt)
GET  /api/expenses/{refId}
GET  /api/expenses/{refId}/decision
GET  /api/expenses/recent?limit=20
```

### Admin
```
GET  /api/admin/dashboard                                      (analyst+compliance+admin)
GET  /api/admin/review-queue?status=pending&limit=&offset=     (analyst+compliance+admin)
POST /api/admin/review-queue/{id}/approve                      (analyst+compliance+admin)
POST /api/admin/review-queue/{id}/reject                       (analyst+compliance+admin)
GET  /api/admin/thresholds                                     (compliance+admin)
PUT  /api/admin/thresholds/{key}                               (compliance+admin)
GET  /api/admin/policy-rules                                   (compliance+admin)
POST /api/admin/policy-rules                                   (compliance+admin)
PUT  /api/admin/policy-rules/{id}                              (compliance+admin)
GET  /api/admin/audit-logs?from=&to=&module=&userId=           (compliance+admin)
GET  /api/admin/audit-logs/export?from=&to=                    (compliance+admin — CSV stream)
GET  /api/admin/audit-logs/verify-chain                        (compliance+admin)
GET  /api/admin/integrations                                   (analyst+compliance+admin)
```

## Audit hash chain

Every AI module invocation appends an `audit_logs` row via `sp_insert_audit_log_with_hash`. The stored procedure:

1. Takes an advisory lock (`pg_advisory_xact_lock`) on the chain key so concurrent writes serialize.
2. Reads the previous row's `hash` (genesis = `"0" × 64`).
3. Builds a canonical JSONB payload via `fn_build_audit_payload` (normalizes timestamp + numeric precision to avoid non-determinism).
4. Computes `hash = SHA256(prev_hash || canonical_json(payload))` via `fn_calculate_audit_hash` (`pgcrypto.digest`).
5. Inserts with `prev_hash` + `hash`.

`fn_verify_audit_chain()` replays the chain from genesis and returns one row per divergence (stored hash ≠ recomputed hash). Exposed via `GET /api/admin/audit-logs/verify-chain`.

Tamper demo:
```sql
UPDATE audit_logs SET output_snapshot = '{"tampered":true}'::jsonb WHERE seq = 1;
SELECT * FROM fn_verify_audit_chain();
-- returns seq=1 divergence row; all subsequent rows remain consistent with the stored chain.
```

## Configuration reference

See `.env.example` for the full list. Key settings:

| Env var | Purpose |
|---|---|
| `ConnectionStrings__Default` | Npgsql connection string |
| `Jwt__Secret` | HS256 signing key (≥ 32 bytes) |
| `Jwt__AccessTokenTtlMinutes` | Token lifetime (default 720 = 12 h) |
| `OpenAI__ApiKey` | Blank = stub services; real key = live GPT-4o |
| `OpenAI__TimeoutMs` | Per-call timeout (default 5000, FR-5.4) |
| `Gstin__ApiBase`, `Gstin__ApiKey` | External GSTIN lookup provider |
| `Storage__UploadsPath`, `Storage__MaxBytes` | Receipt file storage + size cap (default 10 MiB, FR-2.5) |
| `Cors__AllowedOrigins` | Comma-separated origins (Angular at :4200, mobile at :19006) |

## Portal deployment (`docker-compose.prod.yml`)

The hackathon portal runs `docker compose -f docker-compose.prod.yml --profile prod up --build` on a shared host. Our compose file is built around its contract:

- **Single host port** — only `frontend` publishes `${PORT}:80`. Postgres + backend live on the internal network.
- **`profiles: [prod]`** on every service so `--profile prod` activates them.
- **Reverse proxy** — nginx in the `frontend` container proxies `/api/*` and `/health` to `backend:8080`. Browser, mobile, and Swagger all hit one origin.
- **Non-root containers** — `USER app` (.NET) and `USER nginx` (frontend), each with `HEALTHCHECK`.
- **`.env.prod`** committed at the repo root with placeholder values; the portal pipeline renames it to `.env` and (optionally) injects real secrets at runtime.
- **Explicit `/28` subnet** (`10.201.42.0/28`) — works around the portal's exhausted Docker default address pools.
- **ICU + globalization** — alpine runtime image installs `icu-libs icu-data-full` and turns invariant mode off, so `CultureInfo("en-IN")` formats `₹2,50,000` correctly.

Local dry-run before pushing:

```bash
PORT=4300 Jwt__Secret=$(openssl rand -base64 48) \
  docker compose -f docker-compose.prod.yml --profile prod up --build -d
# → http://localhost:4300
```

## Troubleshooting

- **Local dev API returns 500 on login** — Postgres isn't running. `docker compose up -d postgres`.
- **Login API returns "Invalid credentials"** — type the **full** demo email (`admin@demo.local`), not just `admin`.
- **Frontend in dev calls a hardcoded URL** — make sure `ng serve` was started after `frontend/src/environments/environment.ts` last changed; HMR reloads fileReplacements lazily.
- **Backend can't find `prompts/` folder** — the folder is copied by the Dockerfile to `/app/prompts`; for `dotnet run` we resolve it from `AppContext.BaseDirectory`.
- **Mobile app can't reach API from phone** — phone must be on the same Wi-Fi as the laptop. Update `Mobile/app.json -> extra.apiBase` to your LAN IP, e.g. `http://192.168.1.x:4300/api`.
- **Pipeline failure on portal: "all predefined address pools have been fully subnetted"** — already handled by the explicit `/28` in `docker-compose.prod.yml`. If it still fails, swap the subnet to another rare range (e.g. `10.202.77.0/28`).
- **Globalization error `en-in is invalid culture identifier`** — alpine runtime needs `icu-libs`. Already installed in `backend/Dockerfile` and asserted via `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false`.

## Docs

- [FRS.md](FRS.md) — Functional Requirements Specification
- [database/README.md](database/README.md) — schema + stored procedure reference
- [LICENSE](LICENSE) — MIT
