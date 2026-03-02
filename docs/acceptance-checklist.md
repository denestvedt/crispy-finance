# Acceptance checklist

Use this checklist for **every environment**: local, staging, and Vercel preview.

## How to run this checklist per environment

1. Set the environment URL and project reference.
2. Run every command in the checklist.
3. Mark each item as **PASS** only when the observed output matches the expected output.
4. If any item fails, mark the environment **FAIL** and do not promote.

```bash
# Replace values per environment before running checks.
export APP_BASE_URL="https://<environment-url>"
export SUPABASE_PROJECT_REF="<project-ref>"
```

## Pass/fail verification matrix

| Item | Verification command(s) | Expected output for PASS | FAIL condition |
|---|---|---|---|
| UI loads in browser | `open "$APP_BASE_URL"` (manual browser check), then `curl -sS -o /tmp/ui-health.html -w '%{http_code}\n' "$APP_BASE_URL"` | Browser renders app shell/homepage without runtime error screen. `curl` prints `200` (or redirect chain ending in `200`). | Browser shows blank/error page, or `curl` is `>=500` / connection failure. |
| All scaffold routes render without 500s | `for route in / /dashboard /accounts /obligations /journal /settings; do code=$(curl -sS -o /tmp/route-check-$(echo "$route" | tr '/' '_').html -w '%{http_code}' "$APP_BASE_URL$route"); echo "$route -> $code"; done` | Every line ends in non-5xx (typically `200`, sometimes `307/308` then `200` after redirect). | Any route returns `500-599` or connection error. |
| Migrations run successfully | `supabase link --project-ref "$SUPABASE_PROJECT_REF"` then `supabase db push` | `Finished supabase db push.` and no SQL error blocks in output. | Any migration error, permission error, or non-zero exit. |
| RLS policies exist | `supabase db remote commit --dry-run >/dev/null 2>&1 || true` (optional connection warm-up), then `supabase db pull --schema public --linked >/tmp/schema.sql && rg -n "create policy|alter table .* enable row level security" /tmp/schema.sql` | `rg` returns one or more lines containing `create policy` and RLS enable statements. | No `create policy` matches, no RLS enable statements, or command errors. |
| Journal balance trigger exists | `supabase db pull --schema public --linked >/tmp/schema.sql && rg -n "create trigger enforce_journal_balance|function check_journal_balance" /tmp/schema.sql` | Output includes both `function check_journal_balance` and `create trigger enforce_journal_balance`. | Either function or trigger is missing, or command errors. |

## Environment checklist template

Repeat this block for local, staging, and Vercel preview.

### Local

- [ ] UI loads in browser
- [ ] All scaffold routes render without 500s
- [ ] Migrations run successfully
- [ ] RLS policies exist
- [ ] Journal balance trigger exists
- Overall status: **PASS / FAIL**

### Staging

- [ ] UI loads in browser
- [ ] All scaffold routes render without 500s
- [ ] Migrations run successfully
- [ ] RLS policies exist
- [ ] Journal balance trigger exists
- Overall status: **PASS / FAIL**

### Vercel preview

- [ ] UI loads in browser
- [ ] All scaffold routes render without 500s
- [ ] Migrations run successfully
- [ ] RLS policies exist
- [ ] Journal balance trigger exists
- Overall status: **PASS / FAIL**

## Known limitations

- Position API may still return placeholder/provisional projection data in environments without full seeded ledger history.
- Some Edge Functions may include TODO paths (for example, retries/backoff or notification branches) that are intentionally scaffolded and not production-hardened yet.
- Route accessibility may depend on auth/session state; redirect responses (307/308) can be acceptable when they resolve to non-5xx pages.
- Hosted Supabase projects with restricted roles may require elevated database permissions to run all verification commands.

## Feature acceptance criteria (auth + household bootstrap)

- A new user can sign up and see their own household dashboard.
