# MVP execution plan (agent-driven)

This document turns the current scaffold into an execution-ready plan where development can be delegated task-by-task to the coding agent.

## Goal

Ship a usable MVP where a real user can:

1. sign up / log in,
2. get household bootstrap automatically,
3. view a live (non-demo) dashboard backed by Supabase data pipelines,
4. pass environment acceptance checks for local + staging + preview.

---

## How to use this plan with the agent

Use one ticket at a time. For each ticket:

1. Copy the ticket brief into a prompt.
2. Ask the agent to implement it fully, run checks, commit, and open a PR.
3. Merge only when Definition of Done is met.
4. Move to the next ticket in order.

### Prompt template (copy/paste)

```text
Implement Ticket <ID>: <TITLE> from docs/mvp-execution-plan.md.

Requirements:
- Complete all scope items for this ticket.
- Run all relevant tests/checks.
- Update docs if behavior changes.
- Commit changes and create a PR.
- In your final message, include:
  - Summary of what changed
  - Test commands + pass/fail
  - Any follow-up risks

Definition of Done:
<PASTE DOD FROM TICKET>
```

---

## Owner order (recommended)

1. Platform/Infra
2. Backend/Supabase
3. Frontend
4. QA
5. Tech Lead release decision

This ordering minimizes blockers and allows parallel execution once deployment and database baselines are ready.

---

## Ticket backlog (MVP)

### T1 — Configure Vercel monorepo deployment baseline (P0)
**Owner:** Platform/Infra  
**Depends on:** none

**Scope**
- Configure Vercel with `apps/web` root.
- Apply install/build commands from deployment guide.
- Pin Node runtime as documented.

**Definition of Done**
- Vercel settings match the deployment runbook.
- Fresh deployment succeeds.
- Build logs confirm custom install/build commands were used.

References: `docs/deployment-vercel-supabase.md`.

---

### T2 — Set required environment variables in Vercel (P0)
**Owner:** Platform/Infra  
**Depends on:** T1

**Scope**
- Add `NEXT_PUBLIC_SUPABASE_URL`.
- Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Add `NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID`.
- Apply to Preview + Production (+ Development if needed).

**Definition of Done**
- Variables exist in correct scopes.
- Redeploy completed after env updates.
- App loads without env-related runtime errors.

References: `docs/deployment-vercel-supabase.md`.

---

### T3 — Link hosted Supabase project and apply database baseline (P0)
**Owner:** Backend/Supabase  
**Depends on:** T2

**Scope**
- Link project via Supabase CLI.
- Push all migrations.
- Deploy all required Edge Functions.

**Definition of Done**
- `supabase db push` succeeds without SQL/migration errors.
- All listed Edge Functions are deployed.
- Database schema includes RLS policies and journal balance trigger.

References: `docs/deployment-vercel-supabase.md`, `docs/acceptance-checklist.md`.

---

### T4 — Complete auth flow UX (signup/login + redirects) (P0)
**Owner:** Frontend  
**Depends on:** T2

**Scope**
- Validate signup and login happy paths.
- Ensure clear error/loading states.
- Ensure auth/non-auth redirects are correct.

**Definition of Done**
- Unauthenticated users are redirected to `/login` for protected pages.
- Authenticated users are redirected away from `/login`/`/signup` to `/dashboard`.
- Signup/login flows complete without broken state transitions.

References: `apps/web/app/(auth)/*`, `apps/web/middleware.ts`.

---

### T5 — First-login household bootstrap integration (P0)
**Owner:** Backend/Supabase + Frontend  
**Depends on:** T4

**Scope**
- Trigger household bootstrap for first authenticated session.
- Ensure idempotent behavior on retries.
- Surface household context in dashboard.

**Definition of Done**
- New user gets owner membership and household automatically.
- Repeated bootstrap calls do not create duplicates.
- Dashboard displays household metadata for the logged-in user.

References: `apps/web/app/api/auth/bootstrap-household/route.ts`, `apps/web/lib/supabase/ensure-household.ts`, `apps/web/app/(app)/dashboard/page.tsx`.

---

### T6 — Replace demo-mode data paths with live projections (P0)
**Owner:** Frontend + Backend  
**Depends on:** T3, T5

**Scope**
- Wire dashboard modules to live projection/ledger data.
- Remove MVP-critical placeholder assumptions.
- Keep robust empty/error states.

**Definition of Done**
- Position, account balances, and unread notifications render from live backend data.
- Demo-only data is not required for dashboard operation in configured environments.
- Route/API behavior remains non-5xx under normal use.

References: `README.md`, `apps/web/components/dashboard/DashboardClient.tsx`, `apps/web/app/api/projections/*`.

---

### T7 — Validate Plaid webhook ingest → journal flow (P0)
**Owner:** Backend/Supabase  
**Depends on:** T3

**Scope**
- Verify queue pickup/processing/retry/dead-letter transitions.
- Confirm idempotent journal entry creation.
- Confirm latency/failure metrics inserts.

**Definition of Done**
- Test webhook events create expected ingest and journal side effects.
- Duplicate transaction events are safely deduplicated.
- Retry/dead-letter behavior matches configured attempt policy.

References: `supabase/functions/plaid-webhook-worker/index.ts`.

---

### T8 — Implement real notification behavior (replace placeholder) (P1)
**Owner:** Backend/Supabase  
**Depends on:** T7

**Scope**
- Replace `send-notification` placeholder response with real MVP behavior.
- Add request validation and outcome logging.

**Definition of Done**
- Function performs actual notification action (or durable queue write) for supported events.
- Returns structured success/failure responses.
- No remaining placeholder-only path for normal calls.

References: `supabase/functions/send-notification/index.ts`, `docs/operational-readiness.md`.

---

### T9 — Add accounting correctness tests (P0)
**Owner:** Backend/Supabase  
**Depends on:** T7

**Scope**
- Add automated tests for journal balancing safeguards.
- Add automated tests for accrual posting behavior.

**Definition of Done**
- Tests are runnable in local/CI workflow.
- Failing invariants break the test run.
- Test coverage includes at least one happy path and one failure path per area.

References: `README.md`.

---

### T10 — Execute acceptance checklist in all environments (P0)
**Owner:** QA  
**Depends on:** T4–T9

**Scope**
- Run checklist commands and manual checks for local/staging/preview.
- Record PASS/FAIL and remediation tickets.

**Definition of Done**
- Local, staging, and preview checklists are fully filled.
- No open P0 failures remain.
- Promotion decision based on checklist outcomes.

References: `docs/acceptance-checklist.md`.

---

### T11 — Operational alerts and SLO instrumentation for MVP paths (P1)
**Owner:** Platform + Backend  
**Depends on:** T7, T8

**Scope**
- Ensure structured logs include required context fields.
- Configure alerting for cron failures and dead-letter growth.
- Validate runbook links and incident paths.

**Definition of Done**
- Alerts trigger correctly in test scenarios.
- Teams have documented response path/runbooks.
- MVP pipelines have basic observability coverage.

References: `docs/operational-readiness.md`.

---

### T12 — Release readiness and staged rollout decision (P0)
**Owner:** Tech Lead  
**Depends on:** T10, T11

**Scope**
- Run go/no-go table and review checklist outcomes.
- Approve staged rollout (canary → partial → full).
- Define rollback trigger thresholds.

**Definition of Done**
- Formal Go/No-Go decision documented.
- Rollout plan and rollback criteria documented.
- First production increment scheduled or executed.

References: `docs/deployment-vercel-supabase.md`, `docs/operational-readiness.md`.

---

## Minimum shippable cut (if you want fastest path)

Deliver in this order: **T1 → T2 → T3 → T4 → T5 → T6 → T7 → T9 → T10 → T12**.

Treat **T8** and **T11** as immediate hardening follow-up if time constrained.

---

## Tracking table (fill during execution)

| Ticket | Status | PR | Owner | Notes |
|---|---|---|---|---|
| T1 | TODO |  |  |  |
| T2 | TODO |  |  |  |
| T3 | TODO |  |  |  |
| T4 | TODO |  |  |  |
| T5 | TODO |  |  |  |
| T6 | TODO |  |  |  |
| T7 | TODO |  |  |  |
| T8 | TODO |  |  |  |
| T9 | TODO |  |  |  |
| T10 | TODO |  |  |  |
| T11 | TODO |  |  |  |
| T12 | TODO |  |  |  |

