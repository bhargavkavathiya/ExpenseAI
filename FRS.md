# Functional Requirements Specification (FRS)

**Project:** UC10 — Artificial Intelligence Expense Report Auditor with Policy Compliance
**Team:** TransitCoders
**Event:** Amnex Infotechnologies Hackathon — Sarjan (April 2026)
**Repository:** transitcoders-1dgc
**Document version:** 2.0 (2026-04-24) — stack pivot to .NET 8 + PostgreSQL + Angular (see §9 Addendum for diffs)

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional requirements for an Artificial Intelligence (AI) powered expense report auditor. The system accepts employee-submitted expense receipts through a mobile application, extracts structured data, applies fraud-detection and policy-compliance checks, produces an auditable decision, and routes low-confidence cases to a human reviewer through an administrator dashboard.

### 1.2 Scope
In scope:
- Mobile application for receipt submission and result viewing
- Backend Application Programming Interface (API) orchestrating four AI modules — Optical Character Recognition (OCR), duplicate detection, anomaly detection, and policy rule engine
- Administrator web dashboard for metrics, threshold tuning, and audit export
- Tamper-evident audit log with Personally Identifiable Information (PII) redaction
- External integration with the Goods and Services Tax Identification Number (GSTIN) lookup API

Out of scope (for hackathon demo):
- Corporate Single Sign-On (SSO) integration
- Multi-tenant organization management
- Long-term model training or fine-tuning
- Payment disbursement / accounting-system integration

### 1.3 Definitions, acronyms, and abbreviations
| Term | Expansion |
|---|---|
| AI | Artificial Intelligence |
| API | Application Programming Interface |
| CSV | Comma-Separated Values |
| GST / GSTIN | Goods and Services Tax / Goods and Services Tax Identification Number |
| GPT-4o | OpenAI's multimodal (text, image, audio) Generative Pre-trained Transformer 4 model |
| JWT | JSON Web Token |
| ML | Machine Learning |
| OCR | Optical Character Recognition |
| pHash | Perceptual image hash (used for near-duplicate image detection) |
| PII | Personally Identifiable Information |
| RN | React Native |

### 1.4 References
- UC10 Use Case Specification (Amnex Hackathon 2026)
- OpenAI GPT-4o Vision API documentation
- Plan file: `.claude/plans/we-have-participated-in-virtual-perlis.md`

---

## 2. Overall Description

### 2.1 Product perspective
A three-tier system: React Native mobile client, Python FastAPI backend, React admin web client, with MongoDB for storage. External dependencies: OpenAI API (GPT-4o Vision + text), public GSTIN lookup API.

### 2.2 User classes
| Role | Primary actions |
|---|---|
| Customer (employee) | Register, authenticate, submit receipt, view decision |
| Financial Analyst / Operations Officer | Review flagged items, sign off on decisions |
| Compliance Officer | Review audit logs, tune thresholds, export reports |
| System (automated) | Run AI pipeline on submitted receipts |

### 2.3 Operating environment
- Mobile: iOS 14+, Android 9+ (React Native via Expo)
- Backend: Linux containers; Python 3.11; deployed via `docker-compose.prod.yml`
- Admin: Modern evergreen browsers (Chrome, Edge, Firefox)
- Hardware: Standard laptop class; no GPU required

### 2.4 Assumptions and dependencies
- Valid `OPENAI_API_KEY` with GPT-4o Vision access
- `GST_API_KEY` for the free-tier GSTIN lookup service
- Network reachability to `api.openai.com` and the GSTIN provider
- 20+ sample Indian receipt images for demo

---

## 3. Functional Requirements

Each requirement is tagged `FR-x.y`. Traceability to use case sections shown in brackets.

### 3.1 Authentication & Onboarding [UC 3.1]
- **FR-1.1** The mobile app shall allow a user to register with email and password.
- **FR-1.2** The mobile app shall authenticate registered users and maintain a session using JWT.
- **FR-1.3** Registration shall reject emails that are already in use with a clear error message.
- **FR-1.4** Passwords shall be stored as salted hashes (bcrypt or equivalent). Plain-text storage is prohibited.
- **FR-1.5** On successful authentication the app shall land the user on the Submit screen.

### 3.2 Receipt Submission [UC 3.1]
- **FR-2.1** The mobile app shall allow the user to capture a new receipt image via device camera or pick an existing image from the gallery.
- **FR-2.2** The app shall preview the selected image before submission and allow retake/replace.
- **FR-2.3** On submission, the backend shall persist the image and return a reference identifier (`ref_id`) within two seconds.
- **FR-2.4** The app shall display an on-screen acknowledgement containing the `ref_id`.
- **FR-2.5** Input validation shall reject unsupported file types or images larger than 10 MB with a clear error message.

### 3.3 AI Processing Pipeline [UC 3.2]
Each AI capability shall be implemented as a distinct, independently testable module behind a common interface.

- **FR-3.1 (OCR)** The OCR module shall extract structured fields from a receipt image using GPT-4o Vision: `vendor`, `gstin`, `date`, `total`, `currency`, `items[]`.
- **FR-3.2 (OCR)** The OCR module shall return a confidence score in `[0, 1]`.
- **FR-3.3 (OCR)** The OCR module shall complete within three seconds for a representative sample image.
- **FR-3.4 (Duplicate)** The duplicate-detection module shall compute a perceptual image hash (pHash) and compare against the submitting user's prior submissions from the last 90 days.
- **FR-3.5 (Duplicate)** A Hamming distance below eight against any prior hash shall flag the receipt as a likely duplicate.
- **FR-3.6 (Anomaly)** The anomaly-detection module shall use an Isolation Forest trained on the user's historical features (`amount`, `day_of_week`, encoded `vendor_category`) to score out-of-pattern submissions.
- **FR-3.7 (Anomaly)** When user history is insufficient (cold start), the module shall fall back to a z-score over seeded fixtures.
- **FR-3.8 (Policy)** The policy module shall evaluate the extracted expense against a JSON-configured rule set (amount caps, disallowed categories, mandatory GSTIN above threshold, time windows).
- **FR-3.9 (Policy)** For rules flagged as ambiguous, the policy module shall invoke GPT-4o for interpretation and merge the result.
- **FR-3.10 (Aggregation)** An aggregator shall compute an overall confidence as a weighted average of the four module scores (OCR 0.3, Duplicate 0.2, Anomaly 0.2, Policy 0.3).
- **FR-3.11 (Aggregation)** The aggregator shall generate a plain-language explanation (three sentences, finance-team tone) via GPT-4o.

### 3.4 Deterministic AI Invocation [UC 3.2]
- **FR-4.1** Every OpenAI invocation shall reference a versioned system prompt (e.g., `ocr_v1.0.0`).
- **FR-4.2** The prompt version identifier shall be persisted in the audit log for each invocation.
- **FR-4.3** Prompt files shall be checked into the repository under `Backend/app/prompts/` with the version in the filename.

### 3.5 External Integrations [UC 3.3]
- **FR-5.1** The system shall call the GSTIN lookup API to verify the vendor's tax identifier.
- **FR-5.2** Every external call shall implement retry with exponential backoff (maximum three attempts) and a circuit breaker (open after five consecutive failures, half-open after 30 seconds).
- **FR-5.3** When the circuit is open, the system shall continue the flow with a `gstin_verified: null` result and surface a user-readable message ("GSTIN verification service temporarily unavailable").
- **FR-5.4** External calls shall enforce timeouts: OpenAI 5 seconds, GSTIN 3 seconds.

### 3.6 Output & Result Experience [UC 3.4]
- **FR-6.1** The mobile app shall display an AI-generated result on a clearly labelled screen with:
  - Status badge: **Approved** / **Needs Review** / **Rejected**
  - Confidence meter
  - Plain-language explanation
  - Per-module breakdown (collapsible)
- **FR-6.2** Every AI-generated decision shall include a confidence score.
- **FR-6.3** When confidence is below the configured threshold (default 0.6), the result screen shall display "Routed to analyst for review" instead of an automated decision, and the expense shall be placed in the `review_queue`.
- **FR-6.4** The user may manually request human review regardless of confidence.

### 3.7 Administrator Controls [UC 3.5]
- **FR-7.1** The admin dashboard shall display a real-time (5-second refresh) summary of: submission volumes (last 1h / 24h), confidence score distribution (10 buckets), and error rates.
- **FR-7.2** The admin shall be able to tune thresholds (confidence minimum, rate limits, duplicate Hamming threshold) at runtime without redeploying the backend.
- **FR-7.3** Threshold changes shall take effect within five seconds.
- **FR-7.4** The admin shall be able to export the audit log for a selected date range as a CSV file.
- **FR-7.5** Exported CSVs shall have PII already redacted.
- **FR-7.6** The admin shall be able to view and action items in the `review_queue`.

### 3.8 Audit, Logging & Compliance [UC 3.6]
- **FR-8.1** Every AI-generated decision shall be written to an append-only audit log.
- **FR-8.2** Each log entry shall record: timestamp, user_id, expense_id, module name, input reference, output, model version, confidence score.
- **FR-8.3** Each entry shall be tamper-evident via a SHA-256 hash chain: `hash = sha256(prev_hash || canonical_json(entry))`. The genesis entry uses `prev_hash = "0" * 64`.
- **FR-8.4** A standalone verification script shall re-compute the hash chain and report the first divergence (if any).
- **FR-8.5** PII (names, phone numbers, card numbers) shall be redacted from logs using regex-based masking, except where legally required to retain.

### 3.9 Performance & Deployment [UC 3.7]
- **FR-9.1** The end-to-end primary-user flow shall complete in under five seconds for a typical input, excluding network latency to external APIs.
- **FR-9.2** The backend shall be deployable via the repository-root `docker-compose.prod.yml` using `docker-compose -f docker-compose.prod.yml up`.
- **FR-9.3** The backend shall tolerate a 15-minute continuous demonstration without crashes, memory leaks, or exceeding standard laptop resources.

### 3.10 Accessibility & Language [UC Acc. Crit. 7]
- **FR-10.1** Every acronym (AI, ML, OCR, API, GST, GSTIN, JWT, PII) shall be expanded on first occurrence per screen in user-facing text.
- **FR-10.2** A central glossary helper shall track first-occurrence expansion state per screen.

---

## 4. External Interface Requirements

### 4.1 User interfaces
- **Mobile (React Native / Expo)** — 4 screens: Login, Submit, Acknowledgement, Result.
- **Admin (React + Vite + Tailwind)** — 2 pages: Dashboard, Settings (thresholds + exports + review queue).

### 4.2 API interfaces (backend exposes)
- `POST /auth/register`, `POST /auth/login`
- `POST /expenses`, `GET /expenses/{ref_id}`
- `POST /expenses/{ref_id}/review` (request human review)
- `GET /admin/metrics`, `GET/PUT /admin/thresholds`
- `GET /admin/review-queue`, `POST /admin/review-queue/{id}/decide`
- `GET /admin/audit/export?from=&to=` (streams CSV)

### 4.3 External APIs consumed
- OpenAI API — `chat.completions` with GPT-4o Vision and GPT-4o text
- GSTIN lookup API — `GET /gstin/{number}` (free tier)

### 4.4 Data stores
- MongoDB collections: `users`, `expenses`, `audit_log`, `policies`, `config`, `review_queue`

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | End-to-end under 5 s (excluding external network); OCR under 3 s |
| Reliability | 15-minute demonstration without crashes; circuit breakers on every external call |
| Security | JWT-based auth; bcrypt password hashing; PII redaction in logs; HTTPS for production |
| Auditability | Append-only hash-chained audit log; every AI call logged with model + prompt version |
| Configurability | Thresholds tunable without redeploy |
| Portability | Runs on standard laptop; no GPU; deployable via one docker-compose command |
| Usability | New user completes primary flow without external instructions; acronyms expanded on first use |

---

## 6. Acceptance Criteria (traceability)

| # | Use Case Criterion | FRS Requirement(s) |
|---|---|---|
| 1 | New user completes primary flow unaided | FR-2.*, FR-6.1, FR-10.* |
| 2 | OCR testable output within three seconds | FR-3.1, FR-3.3 |
| 3 | Confidence score + plain-language explanation | FR-3.10, FR-3.11, FR-6.1, FR-6.2 |
| 4 | Low confidence triggers fallback path | FR-6.3 |
| 5 | Every AI invocation logged with required fields | FR-8.1, FR-8.2 |
| 6 | 15-minute demo stability | FR-5.2, FR-5.3, FR-9.3 |
| 7 | Acronyms expanded on first occurrence | FR-10.1, FR-10.2 |
| 8 | External API outage handled gracefully | FR-5.2, FR-5.3 |

---

## 7. Out-of-Scope / Deferred

- Multi-organization / multi-tenant separation
- Role-Based Access Control (RBAC) beyond three built-in roles
- Internationalisation beyond English
- Mobile offline submission queue
- Real corporate SSO, Active Directory, or LDAP integration
- Push notifications
- Native image capture on iOS Simulator (demo on physical device or Android emulator)

---

## 8. Glossary

| Term | Meaning |
|---|---|
| Circuit breaker | Library pattern (here: `Polly` for .NET) that stops calling a failing dependency for a cool-off period |
| Confidence score | Number in `[0, 1]` representing the system's belief in a decision |
| Hamming distance | Count of differing bits between two binary strings |
| Isolation Forest | Unsupervised anomaly-detection algorithm that isolates outliers via random feature splits — deferred; hackathon ships z-score baseline (see §9 Addendum) |
| Perceptual hash (pHash) | Image fingerprint that is stable under compression/resizing, enabling near-duplicate detection |
| Tesseract | Open-source OCR engine (mentioned only for comparison — not used in this project) |
| EF Core | Entity Framework Core — object-relational mapper used with Npgsql against PostgreSQL |
| Polly | .NET resilience library for retry, timeout, circuit breaker |
| RBAC | Role-Based Access Control — enforced via `[Authorize(Roles="...")]` on admin endpoints |

---

## 9. Addendum — Stack Pivot Diffs (v1 → v2)

The project started on Python FastAPI + MongoDB + React admin and was rebuilt mid-hackathon on .NET 8 + PostgreSQL + Angular at the team's request. The **functional requirements (FR-*) are unchanged**; this addendum records implementation diffs so traceability in §6 stays stable.

### 9.1 Platform

| v1 (deprecated) | v2 (shipped) |
|---|---|
| Python 3.11 + FastAPI | .NET 8 ASP.NET Core Web API, clean architecture (`Uc10.Api` / `Application` / `Domain` / `Infrastructure` / `Tests`) |
| MongoDB 7 | PostgreSQL 16 with `pgcrypto` |
| React + Vite + Tailwind (admin only) | Angular 19 + Tailwind CSS (employee + admin) |
| React Native Expo mobile (unchanged) | React Native Expo mobile (API base URL repointed) |
| bcrypt/passlib (Python) | `BCrypt.Net-Next` |
| pybreaker / tenacity | `Polly` 8 |
| Python OpenAI SDK | OpenAI .NET SDK (via `IHttpClientFactory` + Polly) |
| scikit-learn Isolation Forest | Statistical z-score baseline (see §9.3) |
| imagehash (Python pHash) | `CoenM.ImageSharp.ImageHash` |

### 9.2 Endpoint paths

All backend routes are now prefixed `/api`. Concretely:

| v1 path | v2 path |
|---|---|
| `POST /auth/register`, `POST /auth/login` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| `POST /expenses`, `GET /expenses/{ref_id}` | `POST /api/expenses` (multipart `receipt`), `POST /api/expenses/{id}/receipt`, `GET /api/expenses/{refId}`, `GET /api/expenses/{refId}/decision`, `GET /api/expenses/recent` |
| `POST /expenses/{ref_id}/review` | folded into `POST /api/admin/review-queue/{id}/approve` + `reject` |
| `GET /admin/metrics` | `GET /api/admin/dashboard` (expanded: KPIs + histogram + module health + integrations) |
| `GET/PUT /admin/thresholds` | `GET /api/admin/thresholds`, `PUT /api/admin/thresholds/{key}` |
| `GET /admin/review-queue`, `POST /admin/review-queue/{id}/decide` | `GET /api/admin/review-queue`, `POST /api/admin/review-queue/{id}/approve`, `POST /api/admin/review-queue/{id}/reject` |
| `GET /admin/audit/export` | `GET /api/admin/audit-logs/export` |
| *new* | `GET /api/admin/audit-logs/verify-chain` — replays the hash chain and reports divergences |
| *new* | `GET /api/admin/policy-rules`, `POST /api/admin/policy-rules`, `PUT /api/admin/policy-rules/{id}` |
| *new* | `GET /api/admin/integrations` |

### 9.3 Anomaly detection — deferred Isolation Forest

FR-3.6 originally called for an Isolation Forest. The hackathon ships a **statistical z-score against the user's historical amount distribution with seeded cold-start fixtures** (mean 1500, stddev 700). Isolation Forest on `(amount, day_of_week, vendor_category)` is deferred to post-hackathon; the `IAnomalyDetectionService` interface is ready to accept a replacement implementation without touching the orchestrator or aggregator.

### 9.4 Audit chain implementation (FR-8.3 addendum)

The tamper-evident SHA-256 chain is now implemented in PostgreSQL:
- `fn_build_audit_payload` — canonical JSONB payload builder (normalizes timestamp to `YYYY-MM-DDTHH:MM:SS.ffffffZ` and casts `confidence` to `NUMERIC(5,4)` to match column precision). Both the insert path and the verify path go through this helper so the hashed input is byte-identical.
- `fn_calculate_audit_hash(prev_hash, payload)` — SHA-256 via `pgcrypto.digest`.
- `sp_insert_audit_log_with_hash` — takes `pg_advisory_xact_lock('uc10_audit_chain')` so concurrent appends serialize; genesis `prev_hash = "0" × 64`.
- `fn_verify_audit_chain()` — replays from seq=1 and returns only divergent rows. Exposed via `GET /api/admin/audit-logs/verify-chain`.

### 9.5 Database tables (PostgreSQL 16)

`roles`, `users`, `user_roles`, `expenses`, `receipt_files`, `ai_invocations`, `audit_logs`, `policy_rules`, `thresholds`, `review_queue`, `gstin_lookup_cache`, `duplicate_hashes`, `anomaly_profiles`, `external_integration_status`.

### 9.6 Dev/ops

- Orchestration file renamed from `docker-compose.prod.yml` → `docker-compose.yml`; services are `postgres` (5432), `backend` (8080, .NET Kestrel), `frontend` (4200, nginx).
- Env var names use ASP.NET Core's double-underscore convention (`ConnectionStrings__Default`, `Jwt__Secret`, `OpenAI__ApiKey`, etc.).
- Backend health endpoint at `/health`; Swagger UI at `/swagger`.
