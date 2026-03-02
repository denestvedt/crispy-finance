# Household CFO

Balance sheet-first personal finance app scaffold.

## Monorepo

- `apps/web`: Next.js 14 app router frontend
- `packages/types`: shared TypeScript domain model
- `supabase/migrations`: SQL migrations for core schema, RLS, and cron
- `supabase/functions`: Edge Function entrypoints

## Quickstart

```bash
pnpm install
pnpm dev
```

## What works today

The dashboard currently runs in a temporary **Demo Mode** with placeholder/query-seeded values so stakeholders can review UX and information hierarchy before live accounting integrations are complete.

### Current scaffold status

- [x] Dashboard (`/dashboard`) — functional in Demo Mode using placeholder/projection data.
- [x] App shell/navigation — scaffolded and usable for routing between implemented app screens.
- [ ] Live accounting data ingestion (Supabase + Plaid pipelines) — scaffolded integration points, not yet functional end-to-end.
- [ ] Auth + household setup flow — planned, not functional yet.
- [ ] Edge-function accounting workflows — scaffolded, not yet fully functional.

## Next implementation milestones

1. Implement auth + household setup flow.
2. Replace API placeholders with Supabase + Plaid integrations.
3. Implement each edge function’s accounting workflow.
4. Add tests for journal balancing and accrual posting.

## Operations

- `docs/operational-readiness.md`: SLOs, alerting, runbooks, and rollout/rollback checklists.
