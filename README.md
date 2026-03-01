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

## Next implementation milestones

1. Implement auth + household setup flow.
2. Replace API placeholders with Supabase + Plaid integrations.
3. Implement each edge function’s accounting workflow.
4. Add tests for journal balancing and accrual posting.
