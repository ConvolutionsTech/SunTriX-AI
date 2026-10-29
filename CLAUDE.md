# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SunTriX AI is an agency website + admin CMS + client engagement platform. Two independent packages:

- **Frontend** (repo root): Vite + React 18 + TypeScript + shadcn/ui + Tailwind + TanStack Query. Deployed to Vercel as an SPA (`vercel.json` rewrites everything to `index.html`). Originally scaffolded with Lovable.
- **Backend** (`backend/`): Express + Mongoose (MongoDB) + TypeScript (CommonJS). Deployed via `backend/Dockerfile` (port 4000, `/health` healthcheck).

## Commands

Frontend (run from repo root):
```bash
npm run dev            # Vite dev server on port 8080 (backend CORS only allows FRONTEND_URL + :5173/:3000 — set FRONTEND_URL accordingly)
npm run build          # production build
npm run lint           # eslint
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
```

Notes:
- Backend build uses `tsconfig.build.json` (excludes `src/test/**`); `npm run typecheck` uses `tsconfig.json` and includes tests. `backend/vitest.config.ts` must reference its setup file by absolute path — a relative `./src/test/setup.ts` resolves to the frontend's file at the repo root.
- `backend/src/test/setup.ts` sets `NODE_ENV=test`, a test `JWT_SECRET`, and defaults `MONGODB_URI` to `mongodb://127.0.0.1:27017/suntrix_test`; it refuses to run if `MONGODB_URI` doesn't contain `_test`/`memory`. Never weaken that guard: `phase1_critical_verification.test.ts` drops an index and deletes documents.
- Backend tests make real outbound calls to Resend/Groq when keys are unset (they log "API key is invalid").
- Secrets are env-only: `JWT_*`, `STRIPE_*`, `RESEND_API_KEY`, `CLOUDINARY_API_KEY/SECRET`, `MONGODB_URI` (`isEnvOnlySetting` in `lib/configLoader.ts`). DB rows for these are ignored and the settings API refuses them.
- First admin: `npm run seed:admin` (idempotent; `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` ≥ 12 chars/`ADMIN_SEED_NAME`). In a built image use `npm run seed:admin:prod`.
- DB tests use `src/test/helpers/db.ts` (`connectTestDb` / `clearTestDb` / `disconnectTestDb`): an in-memory mongod via `mongodb-memory-server`, or `MONGODB_TEST_URI` if set (must be local and contain `_test`). Never call `connectDB()` from tests.
- Backend env: copy `backend/.env.example` to `backend/.env`. Frontend reads `VITE_API_URL` (defaults to `http://localhost:4000/v1`).

## Backend architecture

- **Entry `backend/src/app.ts`**: middleware order matters — helmet → CORS allowlist (`FRONTEND_URL` + localhost) → global rate limit → maintenance-mode gate (bypass list `MAINTENANCE_BYPASS_PREFIXES`) → **raw body for `/v1/payments/webhook` (must stay before `express.json`, for Stripe signature verification)** → JSON parsing → mongo-sanitize. All routes mounted under `/v1`. Per-route limiters: auth (login only), forms, chat. The server only starts when `NODE_ENV !== "test"`; `app` is exported for supertest.
- **Runtime config lives in MongoDB, not just `.env`** (except env-only secrets): `lib/configLoader.ts` seeds `DEFAULT_SYSTEM_SETTINGS` (currently only Groq/chatbot keys), loads every non-env-only row of the `SystemSetting` collection at startup (keys such as `MAINTENANCE_MODE` and rate limits can be upserted ad hoc via the settings route), and hot-reloads on update — per process only. A stored empty value overrides env and the `getSetting` fallback. Always read config with `getSetting(key, default)` rather than `process.env` so admin changes in Admin → Settings take effect without restart. New settings go in `DEFAULT_SYSTEM_SETTINGS`.
- **Layering** (newer core business flow uses a full layered structure; simpler CRUD resources are route + model only):
  - `routes/*.routes.ts` — Express routers; wrap handlers in try/catch → `next(err)`; use `requireAuth` (JWT, `middleware/auth.ts`) for admin endpoints, `validate(ZodSchema)` from `middleware/validate.ts`, and `logAudit(...)` for admin mutations.
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
- Auth: `src/lib/auth.ts` `AuthManager` stores the JWT in localStorage (`suntrix_auth_token`).
- `src/lib/store.ts` is a deprecated empty stub and `src/lib/cms-store.ts` is the legacy localStorage CMS (mostly superseded by the API) — don't build new features on them. The README's "localStorage" backend-integration section is outdated for the same reason.
- `@/` alias → `src/`. `src/components/ui/` are generated shadcn primitives (`components.json`); admin-specific shared components are in `src/components/admin/`.

## Docs

- `PlatformDocumentation.md` — detailed platform/module/deployment reference.
- `PaymentFlow.md` — end-to-end proposal → contract → payment → tracker flow.
