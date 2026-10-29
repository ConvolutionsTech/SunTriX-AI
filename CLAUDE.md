# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SunTriX AI is an agency website + admin CMS + client engagement platform. Two independent packages:

- **Frontend** (repo root): Vite + React 18 + TypeScript + shadcn/ui + Tailwind + TanStack Query. Deployed to Vercel as an SPA (`vercel.json` rewrites everything to `index.html`). Originally scaffolded with Lovable.
- **Backend** (`backend/`): Express + Mongoose (MongoDB) + TypeScript (CommonJS). Deployed via `backend/Dockerfile` (`node:22-alpine`, non-root, `npm ci`, port 4000, healthcheck on `/ready` — DB-aware; `/health` is liveness only; SIGTERM drains and exits within 10 s). Node 22 everywhere (`.nvmrc`, `engines`).

## Commands

Frontend (run from repo root):
```bash
npm run dev            # Vite dev server on port 8080 (backend CORS allows FRONTEND_URL, CORS_ORIGINS and, outside production, localhost:8080/5173/3000)
npm run build          # production build
npm run lint           # eslint, 0 errors + capped warnings (--max-warnings); lower the cap when you remove `any`s
npm run typecheck      # tsc for the app + strict check of src/lib (vite build does NOT type-check)
npm test               # vitest run (jsdom, src/**/*.test.ts(x))
npx vitest run src/test/example.test.ts   # single test file
```

Backend (run from `backend/`):
```bash
npm run dev            # nodemon + ts-node src/app.ts
npm run build          # tsc → dist/
npm run typecheck      # tsc --noEmit (strict, noUnusedLocals/Parameters)
npm test               # vitest run
npx vitest run src/test/money.test.ts     # single test file
npx vitest run -t "test name pattern"
npm run db:sync-indexes # make Mongo indexes match the schemas (idempotent; run on deploy: db:sync-indexes:prod)
```

Notes:
- Backend build uses `tsconfig.build.json` (excludes `src/test/**`); `npm run typecheck` uses `tsconfig.json` and includes tests. `backend/vitest.config.ts` must reference its setup file by absolute path — a relative `./src/test/setup.ts` resolves to the frontend's file at the repo root.
- `backend/src/test/setup.ts` sets `NODE_ENV=test`, a test `JWT_SECRET`, and defaults `MONGODB_URI` to `mongodb://127.0.0.1:27017/suntrix_test`; it refuses to run if `MONGODB_URI` doesn't contain `_test`/`memory`. Never weaken that guard: `phase1_critical_verification.test.ts` drops an index and deletes documents.
- Backend tests can't reach the network: `src/test/setup.ts` blocks `fetch`/`http(s)` to anything but local hosts (and the mongodb-memory-server download), so mock the adapter (`groqAdapter.getClient`, `resendAdapter.emails`/`batch`, `stripeAdapter`, `cloudinary.uploader`). Transactional mail is queued in `EmailLog` (`lib/emailOutbox.ts`); call `drainEmailOutbox()` to deliver it in a test. CI runs `npm run test:coverage`, which fails below 80 % on middleware, lib, modules and the newsletter/tracker/upload routes.
- First admin: `npm run seed:admin` (idempotent; `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` ≥ 12 chars/`ADMIN_SEED_NAME`). In a built image use `npm run seed:admin:prod`.
- DB tests use `src/test/helpers/db.ts` (`connectTestDb` / `clearTestDb` / `disconnectTestDb`): an in-memory mongod via `mongodb-memory-server`, or `MONGODB_TEST_URI` if set (must be local and contain `_test`). Never call `connectDB()` from tests.
- Backend env: copy `backend/.env.example` to `backend/.env` (it documents every key and marks env-only vs DB-overridable). `src/config/env.ts` validates env at startup and refuses to boot if `MONGODB_URI`, `JWT_SECRET`/`JWT_REFRESH_SECRET` (≥ 32 chars, different) or `FRONTEND_URL` are missing, or — in production — any Stripe/Resend/Cloudinary secret. Frontend reads `VITE_API_URL` (defaults to `http://localhost:4000/v1`).

- CI (`.github/workflows/ci.yml`) runs on push to main/dev and on PRs: frontend lint → typecheck → test → build; backend typecheck → build → test (mongo:7 service via `MONGODB_TEST_URI`; each test file gets its own throwaway DB); backend Docker image build. Keep all three green.

## Backend architecture

- **Entry `backend/src/app.ts`**: middleware order matters — helmet → CORS allowlist (`FRONTEND_URL` + `CORS_ORIGINS`; localhost only outside production) → global rate limit → maintenance-mode gate (bypass list `MAINTENANCE_BYPASS_PREFIXES`) → **raw body for `/v1/payments/webhook` (must stay before `express.json`, for Stripe signature verification)** → JSON parsing → mongo-sanitize. All routes mounted under `/v1`. Per-route limiters: auth (login only), forms, chat. The server only starts when `NODE_ENV !== "test"`; `app` is exported for supertest.
- **Config** (`lib/configLoader.ts`): env-only keys (`isEnvOnlySetting`: `JWT_*`, `STRIPE_*`, `CLOUDINARY_*`, `RESEND_API_KEY`, `GROQ_API_KEY`, `MONGODB_URI`, `FRONTEND_URL`) come only from the environment. Everything an admin may change at runtime is declared in `config/settings.registry.ts` (section, type, default, zod schema); it is seeded into `SystemSetting`, cached per process, and edited via `/v1/settings` (admin only; unknown keys and invalid values are rejected). Precedence: DB → env → `getSetting` fallback, with empty values treated as unset. The cache is per process; a save bumps `SettingsVersion` and every instance reloads within ~15 s (scheduler poll; `GET /v1/settings/status` shows the loaded version). To add a runtime setting, add it to the registry — `settings.test.ts` fails if code reads a key that is in neither list. Then run `npm run docs:settings` (backend) to regenerate the reference in `PlatformDocumentation.md` §12.3; `settingsDocs.test.ts` fails when it is stale.
- **Layering** (newer core business flow uses a full layered structure; simpler CRUD resources are route + model only):
  - `routes/*.routes.ts` — Express routers; wrap handlers in try/catch → `next(err)`; use `requireAuth` (JWT, `middleware/auth.ts`) for admin endpoints — it also enforces roles: `viewer` is read-only (any write needs `admin`), unknown roles get 401; add `requireAdmin` for admin-only reads. `src/test/routePolicy.test.ts` walks the real route stack and checks every protected route; `validate(ZodSchema)` from `middleware/validate.ts`, and `logAudit(...)` for admin mutations.
  - `modules/<domain>/` — `*.service.ts` (business logic, class with constructor-injected deps + exported singleton), `*.repository.ts` (Mongoose access), `*.types.ts` (DTOs). Domains: task-requests, proposals, contracts, payments, projects.
  - `models/` — Mongoose schemas.
  - `integrations/<vendor>/*.adapter.ts` — wrappers for Stripe, Groq (LLM), Resend (email), Cloudinary. `services/` holds thin facades over these adapters plus `email.ts` templates, `notification.service.ts`, and `taskStatusMachine.ts`.
  - Errors: throw `AppError` with `ERROR_CODES` (`shared/errors/appError.ts`) or `createError` (`middleware/errorHandler.ts`); the global `errorHandler` formats responses.
- **Engagement lifecycle** (see `PaymentFlow.md`): TaskRequest (`new`) → admin Proposal (`proposal_sent`, AI-draftable via Groq) → client accepts at `/proposal/:token` → Contract generated (`contract_sent`) → client signs at `/contract/:token` (`contract_signed`) → admin Invoice → client pays via Stripe Checkout at `/invoice/:token` → webhook/verify → ProjectTracker (`in_progress`) → `completed`. Status changes must go through `services/taskStatusMachine.ts`, which enforces allowed transitions per actor (`admin` / `system` / `client`). Client-facing pages are public and authenticated by unguessable tokens, not JWT.
- **Money is stored as integer cents** (`lib/money.ts`: `toCents`/`fromCents`/`formatMoney`).
- `lib/scheduler.ts` runs node-cron jobs started after DB connect.

## Frontend architecture

- `src/App.tsx` defines all routes: public marketing pages, client token pages (`/proposal/:token`, `/contract/:token`, `/invoice/:token`, `/track/:token`), payment success/cancel, and `/admin/*` (wrapped in `AdminLayout`).
- `src/lib/api.ts` is the single source of backend endpoints (`ENDPOINTS`) and the `apiRequest<T>()` helper returning `{ data, error }`. Add new endpoints here.
- Data fetching uses TanStack Query; domain hooks live in `src/features/<domain>/hooks/` (e.g. `useTasks`, `useProposals`, `useSettings`).
- Company profile (name, tagline, email, …) comes from `useCompanyInfo()` (`src/hooks/useCompanyInfo.ts`). `GET /cms/company` returns the fields flat — never read `data.data`.
- Admin sessions (`backend/src/lib/tokens.ts`): 15-min access tokens carry `tv` (Admin.tokenVersion; `requireAuth` checks it via a 60 s cache and takes the role from the DB); 7-day refresh tokens rotate on every use, and reuse of an old one revokes all sessions. Logout, password change/reset and role changes call `revokeAllSessions`. In backend tests, get tokens from `staffToken()` in `src/test/helpers/auth.ts` — hand-signed JWTs for non-existent users are rejected.
- Auth: `src/lib/auth.ts` `AuthManager` is the only owner of the session (`suntrix_auth_token`, `suntrix_refresh_token`, `suntrix_auth_user`); never read localStorage directly. `apiRequest` sends the token only on `/admin` pages (or with `{ auth: true }`) because the API treats any Bearer header as "show drafts"; concurrent 401s share one refresh. Log out with `logout()` from `@/lib/api`.
- Site images come from `useMedia(slot)` (`src/hooks/use-media.ts`): the admin's choice from `GET /cms/media-registry` (set via "Use on the site as" in Admin → Media), else the bundled image. The README's "localStorage" backend-integration section is outdated (the legacy localStorage CMS was removed).
- `@/` alias → `src/`. `src/components/ui/` are generated shadcn primitives (`components.json`); admin-specific shared components are in `src/components/admin/`.

## Docs

- `PlatformDocumentation.md` — detailed platform/module/deployment reference.
- `PaymentFlow.md` — end-to-end proposal → contract → payment → tracker flow.
- `RUNBOOK.md` — backups/restore, environments, deploy & rollback (SHA-tagged images from CI), incident checklists, secret rotation.
