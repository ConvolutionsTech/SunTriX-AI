# SunTriX Operations Runbook

What to do when deploying, rolling back, restoring data or handling an incident. Platform details are in `PlatformDocumentation.md` §12 (deployment) and §12.5 (logs, health, metrics, alerts).

> **Not yet done — fill in before go-live:** the hosting provider for the API, the Atlas project/cluster names, who is on call, and the date of the first restore drill (§1.3). Items marked *(confirm)* depend on choices this document can't see.

---

## 1. Backups and restore

### 1.1 Policy
- **Database:** MongoDB Atlas with **continuous cloud backup** (point-in-time restore) or, at minimum, **daily snapshots kept 7–35 days**. *(confirm the tier: point-in-time restore needs M10+)*
- **Media:** files live in Cloudinary. Its own backup setting should be on; the `MediaAsset` collection in MongoDB records every upload.
- **Config:** all secrets are environment variables in the hosting platform's secret store (see §5). Runtime settings (`SystemSetting`) are in the database and are covered by its backups.

### 1.2 Restore (to a scratch cluster first — never straight over production)
1. In Atlas → *Backup*, restore the snapshot or point in time to a **new** cluster (e.g. `suntrix-restore-YYYYMMDD`), or download it and run
   `mongorestore --uri "$SCRATCH_URI" --drop --gzip --archive=snapshot.archive`.
2. Point a local or staging API at the scratch cluster (`MONGODB_URI=…`) and run `npm run db:sync-indexes`.
3. Check: admin can sign in; task requests, proposals, contracts, payments and trackers are present; a client token page (`/proposal/:token`) loads.
4. Only then, if production data is lost, switch production's `MONGODB_URI` to the restored cluster (or restore into production during a maintenance window — §4.2).

### 1.3 Restore drill
Quarterly, run §1.2 against a scratch cluster and record it here.

| Date | Snapshot used | Result | By |
|---|---|---|---|
| *(not yet performed)* | | | |

---

## 2. Environments

| | Development | Staging | Production |
|---|---|---|---|
| Database | local / Atlas dev DB | separate Atlas DB (`suntrix_staging`) | Atlas prod cluster |
| Stripe | test keys (`sk_test_`) | test keys | **live** keys (`sk_live_`) + live webhook secret |
| Stripe webhook | Stripe CLI `stripe listen --forward-to localhost:4000/v1/payments/webhook` | endpoint on the staging API | endpoint on the prod API |
| Resend | sandbox / test domain | verified staging sender | verified production domain |
| `FRONTEND_URL` | `http://localhost:8080` | staging site URL | `https://suntrix.ai` *(confirm)* |
| `CORS_ORIGINS` | — | extra preview origins if any | — |
| Sentry | off | `SENTRY_DSN` (environment = staging) | `SENTRY_DSN` |

Never point staging at the production database or use live Stripe keys outside production. Each environment has its own `JWT_SECRET` / `JWT_REFRESH_SECRET`.

---

## 3. Deploy and roll back

### 3.1 How a release happens
1. Merge to `main`. CI runs lint, typecheck, tests, the frontend build and the Docker build.
2. On green, CI publishes the API image `ghcr.io/<owner>/suntrix-api:<git-sha>` and `:latest`.
3. The API host deploys that SHA tag *(confirm: auto-deploy on `latest`, or pin the SHA in the host's config — pinning is recommended)*.
4. If the release adds or changes indexes, run `npm run db:sync-indexes:prod` in the new container (it is idempotent and safe to run on every deploy).
5. Vercel deploys the frontend from `main` automatically.
6. Verify: `GET /ready` is 200, sign in to the admin, open one client token page, check Sentry and the logs for new errors.

The container's `HEALTHCHECK` uses `/ready`; on `SIGTERM` the API drains in-flight requests and exits within 10 s, so rolling deploys don't drop requests.

### 3.2 Roll back
- **API:** redeploy the previous good image tag (`ghcr.io/<owner>/suntrix-api:<previous-sha>`). There are no schema migrations, so no database step is needed; extra indexes from a newer release are harmless.
- **Frontend:** in Vercel → *Deployments*, promote the previous deployment.
- Note the bad SHA in the incident log and open a fix PR.

---

## 4. Incidents

### 4.1 First five minutes
1. Check `GET /ready` and `GET /health`, Sentry, and the logs (filter by `level>=50`; follow one request with its `reqId`).
2. If a deploy just went out, roll back first (§3.2), investigate after.
3. Note the start time; keep a running log of what you did.

### 4.2 Maintenance mode
Admin → Settings → set **Maintenance mode** on. Public website API calls (forms, chat, blog, portfolio…) get a 503; the admin, sign-in, health checks, the Stripe webhook and clients' capability links (proposal, contract, invoice, tracker) keep working so in-flight engagements aren't interrupted. Turn it off the same way. Changes reach every instance within ~15 s.

### 4.3 Payments
- **Webhook failures:** Stripe retries failed deliveries for up to 3 days. Fix the cause, then in the Stripe dashboard → *Developers → Webhooks → endpoint → failed events*, **resend** them. Processing is idempotent (each event is recorded once), so resending is always safe.
- **Paid but not marked paid / no tracker:** a payment is marked paid only by the signed webhook, so first make sure the webhook is reaching the API (resend failed events as above). Once paid, the reconciler finishes any post-payment work (receipt email, tracker, status) every 5 minutes and emails `ADMIN_EMAIL` if it keeps failing.
- **Refunds:** Admin → Payments → Refund refunds in full; partial refunds are available through `POST /v1/payments/admin/refund/:id` with `amountCents`. The payment shows as refunded once Stripe confirms via webhook.

### 4.4 Email
Dashboard banner "Email is not configured" → `RESEND_API_KEY` is missing in the environment. "Some emails could not be delivered" → open the list, fix the cause (domain verification, Resend outage), then **Retry**. Queued mail is retried automatically up to 5 times.

### 4.5 Admin access lost
- Create or reset the first admin from the server: `npm run seed:admin:prod` with `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` (≥ 12 chars) and `ADMIN_SEED_NAME` set (idempotent; existing admins are left alone).
- An admin who forgot their password uses **Forgot password** on the login page (30-minute, single-use link).
- **Suspected account compromise:** change that admin's password or role (both revoke all of their sessions), and review Admin → Audit Log (sign-ins and failed sign-ins are recorded with IP).

### 4.6 Rotating secrets
| Secret | Effect of rotating | How |
|---|---|---|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | every admin is signed out and signs in again | set new values (≥ 32 chars, different from each other), redeploy |
| `STRIPE_SECRET_KEY` | none if rolled in Stripe first | roll in Stripe dashboard, update env, redeploy |
| `STRIPE_WEBHOOK_SECRET` | webhooks fail until updated | roll the endpoint secret in Stripe, update env immediately, redeploy, resend failed events |
| `RESEND_API_KEY`, `GROQ_API_KEY`, `CLOUDINARY_*` | that integration fails until updated | create the new key, update env, redeploy, revoke the old key |

### 4.7 AI spend spike
Settings → AI → lower **Daily AI token budget** (applies within ~15 s on every instance) or turn **Enable AI features** off. Usage per day is on the admin dashboard and at `GET /v1/admin/ai-usage`.

---

## 5. Secrets

- Secrets (`JWT_*`, `STRIPE_*`, `RESEND_API_KEY`, `GROQ_API_KEY`, `CLOUDINARY_*`, `MONGODB_URI`, `SENTRY_DSN`, `METRICS_TOKEN`) live **only** in the hosting platform's secret store (API host env, Vercel env for `VITE_*`). The API refuses to boot in production without the required ones, and ignores any copy found in the database.
- Never commit `.env` files; `backend/.env.example` documents every key.
- Give each environment its own values (§2). Rotate per §4.6 when someone with access leaves.
