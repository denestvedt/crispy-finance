# Operational readiness plan

## Structured logging standards (all Edge Functions)

All Edge Functions must emit JSON logs with these top-level context keys:

- `household_id`
- `entry_id`
- `event_id`
- `correlation_id`

Implementation details:

1. Use `supabase/functions/_shared/logging.ts` to build per-request context.
2. Prefer inbound `x-correlation-id` and propagate it downstream; generate one when absent.
3. Emit logs for each request lifecycle stage:
   - request received / validation
   - queueing and dequeueing
   - successful processing
   - retry and dead-letter transitions
4. For worker functions, include queue record ID as `entry_id` and source event ID (`webhook_event_id`, `document_parse_id`, etc.) as `event_id`.

## SLOs

### 1) Webhook-to-post latency SLO

- **Indicator**: elapsed time from webhook ingestion (`plaid_webhook_ingest.created_at`) to posting completion (`processed_at`)
- **SLI query source**: `ingestion_latency_metrics` for `pipeline = 'plaid_webhook'`
- **Target**: p95 <= 120 seconds over rolling 7 days
- **Error budget**: 5% of events may exceed 120 seconds

### 2) Dashboard response time SLO

- **Indicator**: API latency for dashboard read endpoints
- **SLI source**: application/API request metrics tagged `route=dashboard`
- **Target**: p95 <= 600ms over rolling 24 hours
- **Error budget**: 5% of dashboard requests may exceed 600ms

### 3) Accrual job success rate SLO

- **Indicator**: successful completion rate for scheduled accrual jobs (`run-daily-accruals`, `run-income-accruals`)
- **SLI source**: cron execution logs + job result records
- **Target**: >= 99.5% successful runs per rolling 30 days
- **Error budget**: <= 0.5% failed runs

## Alerting policy

### Failed cron jobs

- **Signal**: any cron invocation ending in failure state
- **Threshold**: 1 failed run triggers warning; 2 consecutive failures triggers critical
- **Action**: page on-call for critical, open incident channel

### Ingestion dead-letter growth

- **Signal**: count of `dead_letter` records in `plaid_webhook_ingest` + `document_parse_ingest`
- **Threshold**:
  - warning: > 10 new dead letters in 15 minutes
  - critical: > 50 new dead letters in 15 minutes
- **Action**: page on-call and annotate deployment timeline

### Repeated posting balance exceptions

- **Signal**: repeated balancing/posting errors from workers and posting workflows
- **Threshold**: >= 5 matching exceptions in 10 minutes for same household or source pipeline
- **Action**: page on-call, temporarily disable affected pipeline if balance integrity is at risk

## Incident runbooks

### 1) Plaid outage runbook

1. Confirm elevated Plaid API/webhook errors in logs.
2. Verify external status page and incident reports.
3. Switch webhook processing to retry-only mode (no dead-letter promotion for transient upstream failures).
4. Increase retry backoff to reduce pressure.
5. Communicate customer impact and ETA.
6. After recovery, drain backlog in controlled batches and monitor posting latency SLO.

### 2) Cron failure runbook

1. Identify failing scheduled job and latest successful run timestamp.
2. Validate Edge Function health and auth/secret configuration.
3. Re-run failed interval manually in dry-run mode (if available), then live mode.
4. Confirm downstream journal postings and idempotency behavior.
5. Backfill missed dates/windows.
6. Close incident with root cause and preventive action item.

### 3) Projection drift runbook

1. Detect drift from forecast-vs-actual monitors.
2. Segment by account/household and isolate ingestion window.
3. Validate recent schema changes, posting rules, and calculation versions.
4. Recompute projections from known-good checkpoint.
5. Compare corrected outputs and publish impact analysis.
6. Add regression test/data-quality guard for drift vector.

### 4) RLS denial anomaly runbook

1. Confirm unusual increase in `permission denied` / RLS violations.
2. Identify affected role, route/function, and policy IDs.
3. Validate token claims and household scoping rules.
4. Roll back recent policy or API changes if blast radius is broad.
5. Run targeted policy simulation tests.
6. Restore service and document policy hardening tasks.

## Deployment health management

### Staged rollout checklist

1. **Pre-deploy**
   - Verify migrations are backward compatible.
   - Confirm dashboards/alerts are green.
   - Confirm canary household(s) for validation.
2. **Stage 1: canary (5%)**
   - Route a small percentage of traffic.
   - Watch error rate, p95 latency, dead-letter growth for 15–30 minutes.
3. **Stage 2: partial (25-50%)**
   - Expand rollout if canary metrics remain within SLO budget.
   - Re-check cron and webhook worker outcomes.
4. **Stage 3: full (100%)**
   - Complete rollout and monitor for one full cron cycle.

### Rollback checklist

1. Trigger rollback if any critical alert fires or SLO burn rate exceeds threshold.
2. Revert function/app deploy and, if needed, feature flags.
3. Validate that error rates and latency recover within 15 minutes.
4. Reprocess impacted queue records safely using idempotency keys.
5. Publish incident summary, impact window, and follow-up actions.

## Secret management

- Follow the [Secret Rotation Playbook](./secret-rotation-playbook.md) for scheduled and emergency credential rotation.
