# Secret Rotation Playbook

This playbook covers routine and emergency rotation for:

- Supabase service role key
- Plaid client credentials and access token encryption key
- Resend API key
- Web Push VAPID keypair

## Rotation cadence

- **Quarterly**: scheduled rotation for all keys.
- **Immediately**: any suspected secret leakage, credential sharing, or CI log exposure.

## Global preparation checklist

1. Inventory all environments (`dev`, `staging`, `prod`) and all secret stores (Supabase project secrets, CI variables, hosting provider env vars).
2. Prepare a rollback window and notify stakeholders.
3. Confirm deploy pipeline is green before starting.
4. Generate new credentials first; do **not** invalidate old keys until verification passes.

## 1) Supabase service role key

1. In Supabase dashboard, create/regenerate a new service role key.
2. Update secret values in all runtime environments (`SUPABASE_SERVICE_ROLE_KEY`).
3. Redeploy all services/functions that use the key.
4. Run smoke tests:
   - server-side RPC calls
   - cron/worker invocations
   - edge function auth to Supabase APIs
5. Revoke the previous service key.
6. Record rotation timestamp and operator in your incident/change log.

## 2) Plaid credentials + DB token encryption key

### Plaid API keys

1. Create a new Plaid secret in Plaid dashboard.
2. Update `PLAID_CLIENT_ID` and `PLAID_SECRET` in each environment.
3. Redeploy Plaid-dependent services.
4. Validate link token generation, public token exchange, and webhook receipt.
5. Disable the previous Plaid secret.

### `app.plaid_token_encryption_key`

1. Generate a new high-entropy encryption key (minimum 32 chars recommended).
2. Set new Postgres setting for the application runtime:
   - `app.plaid_token_encryption_key`
3. Re-encrypt stored Plaid access tokens by running a one-time migration script:

```sql
update plaid_items
set plaid_access_token = decrypt_plaid_access_token(plaid_access_token_encrypted);

update plaid_items
set plaid_access_token = plaid_access_token;

update accounts
set plaid_access_token = decrypt_plaid_access_token(plaid_access_token_encrypted)
where plaid_access_token_encrypted is not null;

update accounts
set plaid_access_token = plaid_access_token
where plaid_access_token is not null;
```

4. Validate token decrypt/read path through `get_plaid_item_access_token`.
5. Remove all traces of old key material from local shells and temporary notes.

## 3) Resend API key

1. Generate a new Resend API key scoped to the correct environment and sender domain.
2. Update `RESEND_API_KEY` in all environments.
3. Redeploy notification/email services.
4. Send a test email from each environment and verify delivery + SPF/DKIM alignment.
5. Revoke old key.

## 4) VAPID keypair

1. Generate a new VAPID public/private keypair.
2. Update `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in all environments.
3. Redeploy push notification services.
4. Trigger a push test and verify browser subscription renewal behavior.
5. Revoke/remove old private key.

## Verification checklist (all rotations)

- Authentication and background workers are healthy.
- No spike in 401/403/429 in logs.
- Webhook processing remains within SLO.
- No secrets appear in application logs.
- Audit entry for rotation is recorded.

## Emergency rollback

1. If failures exceed your change threshold, temporarily restore previous secret.
2. Redeploy affected services.
3. Open incident with timeline, impact, and mitigations.
4. Schedule corrected re-rotation with root cause documented.
