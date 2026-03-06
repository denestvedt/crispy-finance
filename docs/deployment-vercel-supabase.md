# Deployment guide: Vercel + Supabase hosted

This runbook covers deploying the `apps/web` Next.js app to Vercel and connecting it to a hosted Supabase project.

## 1) Connect this repository to Vercel

1. Sign in to Vercel and click **Add New...** → **Project**.
2. Under **Import Git Repository**, pick this repo and click **Import**.
3. In **Configure Project**:
   - **Framework Preset**: `Next.js` (or keep the auto-detected value).
   - **Root Directory**: click **Edit** and set it to `apps/web`.
4. Open **Build and Output Settings** and set:
   - **Install Command**: `corepack enable && corepack prepare pnpm@9.0.0 --activate && cd ../.. && pnpm install --no-frozen-lockfile`
   - **Build Command**: `cd ../.. && pnpm --filter web build`
   - **Output Directory**: leave blank for Next.js default (`.next`)
5. In **Environment Variables**, add the required values (see section 2 below).
6. Click **Deploy**.

> Why these commands? `web` depends on workspace packages, so install/build must run from the monorepo root even when Vercel Root Directory is `apps/web`.

### Repository baseline committed for this setup

This repo includes a `vercel.json` baseline with the same install/build commands from this guide, and Node runtime is pinned via `engines.node` in both root and `apps/web` `package.json` files. Keep Vercel project settings aligned with these values (especially when **Root Directory** is `apps/web`).


### Exact Vercel UI labels to click

- **Add New...**
- **Project**
- **Import Git Repository**
- **Configure Project**
- **Framework Preset**
- **Root Directory**
- **Build and Output Settings**
- **Install Command**
- **Build Command**
- **Environment Variables**
- **Deploy**

## 2) Required environment variables (Vercel project)

Add these in Vercel under **Project Settings** → **Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL` = your hosted Supabase project URL (for example, `https://<project-ref>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon/public key
- `NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID` = UUID used for default dashboard/account pages in this app
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key (**server-only**, never `NEXT_PUBLIC_*`)

Recommended:

- Add each variable to **Production**, **Preview**, and **Development** scopes as needed.
- After any env var update, trigger a redeploy from **Deployments**.

### Required for household bootstrap fallback

If `/dashboard` shows household setup errors mentioning RLS, ensure `SUPABASE_SERVICE_ROLE_KEY` is set in the same Vercel environment as the failing deployment (for example, **Preview** if the URL is a preview deployment), then redeploy.

## 3) Supabase hosted setup

Run from repository root after installing the Supabase CLI and logging in.

1. Link the local repo to your hosted project:

```bash
supabase link --project-ref <your-project-ref>
```

2. Push local migrations to hosted Supabase:

```bash
supabase db push
```

3. Deploy Edge Functions (deploy each function explicitly):

```bash
supabase functions deploy calculate-position
supabase functions deploy parse-document
supabase functions deploy parse-document-worker
supabase functions deploy period-close
supabase functions deploy plaid-link-exchange
supabase functions deploy plaid-webhook
supabase functions deploy plaid-webhook-worker
supabase functions deploy run-daily-accruals
supabase functions deploy run-income-accruals
supabase functions deploy send-notification
```

4. Verify deployed functions in Supabase Dashboard under **Edge Functions**.

## 4) Go/No-Go checklist

Complete this table before promoting to production.

| Check | How to verify | Go/No-Go |
|---|---|---|
| Migrations applied | `supabase db push` succeeds with no pending migration errors | Go if pass |
| Homepage loads | Open deployed URL `/` and confirm the page renders without runtime errors | Go if pass |
| Dashboard loads | Open `/dashboard` and confirm data/UI loads (or expected empty state) | Go if pass |
| API route returns response | `curl -i https://<deployment-url>/api/projections/position` returns HTTP response (200/4xx/5xx still confirms route is reachable) | Go if pass |

If any row fails, mark **No-Go**, fix, and redeploy.

## 5) Troubleshooting

### Error: `Command "pnpm install --frozen-lockfile" exited with 1`

No—`--frozen-lockfile` is not required for Vercel to build. It is a strict CI safety check that fails when `pnpm-lock.yaml` does not exactly match package manifests.

Use this **Install Command** in Vercel:

```bash
corepack enable && corepack prepare pnpm@9.0.0 --activate && cd ../.. && pnpm install --no-frozen-lockfile
```

If you want strict reproducible installs later, reconcile and commit lockfile changes locally, then switch back to:

```bash
corepack enable && corepack prepare pnpm@9.0.0 --activate && cd ../.. && pnpm install --frozen-lockfile
```


### Error: `ERR_PNPM_META_FETCH_FAIL` / `ERR_INVALID_THIS` during `pnpm install`

This error is typically a runtime/tooling mismatch in Vercel (for example, unexpected Node + pnpm combination), not a Supabase configuration problem.

Use this fix sequence in Vercel:

1. Go to **Project Settings** → **General** → **Node.js Version** and set **20.x**.
2. Go to **Project Settings** → **Build and Deployment** and set:
   - **Install Command**: `corepack enable && corepack prepare pnpm@9.0.0 --activate && cd ../.. && pnpm install --no-frozen-lockfile`
   - **Build Command**: `cd ../.. && pnpm --filter web build`
3. Redeploy from **Deployments** using **Redeploy** (optionally disable cache for the first clean retry).

If Vercel still shows the log line `Running "install" command: "pnpm install"...`, your custom command is not applied yet—re-save the project settings and redeploy.
