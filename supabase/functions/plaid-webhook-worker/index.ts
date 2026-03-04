import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { reserveIdempotencyKey } from '../_shared/idempotency.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MINUTES = 5

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID') ?? ''
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') ?? ''
const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox'

const PLAID_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

async function plaidPost(path: string, body: Record<string, unknown>) {
  const baseUrl = PLAID_BASE[PLAID_ENV] ?? PLAID_BASE.sandbox
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Plaid API error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Build balanced double-entry journal lines for a Plaid transaction.
 *
 * Plaid convention: positive amount = money leaving the account (debit/purchase).
 *   purchase  → Debit expense, Credit linked account
 *   inflow    → Debit linked account, Credit income
 */
function buildJournalLines(
  amount: number,
  linkedAccountId: string,
  expenseAccountId: string,
  incomeAccountId: string,
): Array<{ account_id: string; amount: string; side: 'debit' | 'credit' }> {
  const amountStr = Math.abs(amount).toFixed(2)

  if (amount > 0) {
    // Outflow: Debit expense, Credit linked account
    return [
      { account_id: expenseAccountId, amount: amountStr, side: 'debit' },
      { account_id: linkedAccountId, amount: amountStr, side: 'credit' },
    ]
  } else {
    // Inflow: Debit linked account, Credit income
    return [
      { account_id: linkedAccountId, amount: amountStr, side: 'debit' },
      { account_id: incomeAccountId, amount: amountStr, side: 'credit' },
    ]
  }
}

/** Fetch or lazily create a named system account for a household. */
async function getOrCreateSystemAccount(
  householdId: string,
  accountType: string,
  accountSubtype: string,
  name: string,
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('household_id', householdId)
    .eq('account_type', accountType)
    .eq('account_subtype', accountSubtype)
    .eq('is_system', true)
    .maybeSingle()

  if (existing) return existing.id as string

  const { data: created, error } = await supabaseAdmin
    .from('accounts')
    .insert({ household_id: householdId, account_type: accountType, account_subtype: accountSubtype, name, is_system: true, current_balance: 0 })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create system account "${name}": ${error.message}`)
  return created.id as string
}

serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('plaid-webhook-worker', body, req))

  if (!['POST', 'GET'].includes(req.method)) {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  const batchSize = Number(body.batch_size ?? 25)
  const nowIso = new Date().toISOString()

  logger.info('worker_batch_requested', { batch_size: batchSize })

  const { data: queued, error: queueError } = await supabaseAdmin
    .from('plaid_webhook_ingest')
    .select('id, household_id, webhook_event_id, transaction_ids, payload, attempt_count, created_at')
    .in('status', ['pending', 'retryable'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (queueError) {
    logger.error('worker_queue_fetch_failed', { error: queueError.message })
    throw queueError
  }

  const processed: Array<Record<string, unknown>> = []

  for (const record of queued ?? []) {
    const recordLogger = logger.child({
      household_id: record.household_id as string,
      entry_id: record.id as string,
      event_id: record.webhook_event_id as string,
    })

    const attemptCount = (record.attempt_count as number) + 1
    const { error: processingError } = await supabaseAdmin
      .from('plaid_webhook_ingest')
      .update({ status: 'processing', attempt_count: attemptCount, last_error: null, next_retry_at: null })
      .eq('id', record.id)

    if (processingError) {
      recordLogger.error('worker_mark_processing_failed', { error: processingError.message })
      throw processingError
    }

    try {
      const txIds = Array.isArray(record.transaction_ids) ? (record.transaction_ids as string[]) : []
      const householdId = record.household_id as string
      const plaidItemId = (record.payload as Record<string, unknown>)?.plaid_item_id as string | undefined

      if (txIds.length === 0) {
        recordLogger.info('worker_record_skipped_empty_transaction_ids')

        const processedAt = new Date().toISOString()
        const latencyMs = new Date(processedAt).getTime() - new Date(record.created_at as string).getTime()

        await supabaseAdmin.from('ingestion_latency_metrics').insert({
          pipeline: 'plaid_webhook',
          ingest_record_id: record.id,
          latency_ms: Math.max(latencyMs, 0),
        })

        await supabaseAdmin
          .from('plaid_webhook_ingest')
          .update({ status: 'processed', processed_at: processedAt, last_error: null, next_retry_at: null })
          .eq('id', record.id)

        processed.push({ id: record.id, webhookEventId: record.webhook_event_id, status: 'processed', createdEntries: 0, skipped: true })
        continue
      }

      // Look up access token
      const itemQ = supabaseAdmin
        .from('plaid_items')
        .select('plaid_access_token')
        .eq('household_id', householdId)
      if (plaidItemId) itemQ.eq('plaid_item_id', plaidItemId)

      const { data: plaidItem, error: itemError } = await itemQ.maybeSingle()
      if (itemError || !plaidItem) throw new Error('No Plaid access token found for this household')

      const accessToken = plaidItem.plaid_access_token as string

      // Fetch transactions from Plaid
      const today = new Date().toISOString().slice(0, 10)
      const plaidRes = await plaidPost('/transactions/get', {
        access_token: accessToken,
        start_date: '2000-01-01',
        end_date: today,
        options: { count: txIds.length, offset: 0 },
      })

      const txMap = new Map<string, Record<string, unknown>>()
      for (const tx of (plaidRes.transactions ?? []) as Array<Record<string, unknown>>) {
        txMap.set(tx.transaction_id as string, tx)
      }

      // Ensure system income/expense accounts exist
      const [expenseAccountId, incomeAccountId] = await Promise.all([
        getOrCreateSystemAccount(householdId, 'expense', 'expense', 'General Expenses'),
        getOrCreateSystemAccount(householdId, 'income', 'income', 'General Income'),
      ])

      let createdEntries = 0
      const targetIds = txIds

      for (const txId of targetIds) {
        const dedup = await reserveIdempotencyKey({
          householdId,
          source: 'plaid_transaction',
          sourceEventId: `${record.webhook_event_id}:${txId}`,
        })

        if (dedup.isDuplicate) continue

        const tx = txMap.get(txId)
        if (!tx) {
          recordLogger.warn('worker_tx_not_found', { tx_id: txId })
          continue
        }

        // Resolve linked account by external_account_id, fall back to system cash
        const { data: linkedAcct } = await supabaseAdmin
          .from('accounts')
          .select('id')
          .eq('external_account_id', tx.account_id as string)
          .eq('household_id', householdId)
          .maybeSingle()

        const linkedAccountId = (linkedAcct?.id as string | undefined) ??
          (await getOrCreateSystemAccount(householdId, 'asset', 'cash_equivalent', 'Unmatched Cash Account'))

        const lines = buildJournalLines(tx.amount as number, linkedAccountId, expenseAccountId, incomeAccountId)
        const txDate = (tx.date as string) ?? today
        const description = (tx.name as string) ?? `Plaid transaction ${txId}`

        // Insert header
        const { data: entry, error: entryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({ household_id: householdId, entry_type: 'transaction', source: 'plaid', description, entry_date: txDate, effective_date: txDate, is_posted: false })
          .select('id')
          .single()

        if (entryError) throw entryError

        // Insert lines
        const { error: linesError } = await supabaseAdmin
          .from('journal_lines')
          .insert(lines.map((l) => ({ journal_entry_id: entry.id, account_id: l.account_id, amount: l.amount, side: l.side })))

        if (linesError) throw linesError

        // Post the entry — triggers the balance check trigger
        const { error: postError } = await supabaseAdmin
          .from('journal_entries')
          .update({ is_posted: true })
          .eq('id', entry.id)

        if (postError) throw postError

        createdEntries += 1
      }

      const processedAt = new Date().toISOString()
      const latencyMs = new Date(processedAt).getTime() - new Date(record.created_at as string).getTime()

      await supabaseAdmin.from('ingestion_latency_metrics').insert({
        pipeline: 'plaid_webhook',
        ingest_record_id: record.id,
        latency_ms: Math.max(latencyMs, 0),
      })

      await supabaseAdmin
        .from('plaid_webhook_ingest')
        .update({ status: 'processed', processed_at: processedAt, last_error: null, next_retry_at: null })
        .eq('id', record.id)

      recordLogger.info('worker_record_processed', { created_entries: createdEntries, latency_ms: Math.max(latencyMs, 0) })
      processed.push({ id: record.id, webhookEventId: record.webhook_event_id, status: 'processed', createdEntries })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const deadLetter = attemptCount >= MAX_ATTEMPTS
      const nextRetryAt = deadLetter ? null : new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString()

      await supabaseAdmin.from('ingestion_failure_metrics').insert({
        pipeline: 'plaid_webhook',
        ingest_record_id: record.id,
        attempt_count: attemptCount,
        is_dead_letter: deadLetter,
        error_message: message,
      })

      await supabaseAdmin
        .from('plaid_webhook_ingest')
        .update({
          status: deadLetter ? 'dead_letter' : 'retryable',
          last_error: message,
          next_retry_at: nextRetryAt,
          dead_lettered_at: deadLetter ? new Date().toISOString() : null,
        })
        .eq('id', record.id)

      recordLogger.error('worker_record_failed', { error: message, dead_lettered: deadLetter, attempt_count: attemptCount })
      processed.push({ id: record.id, webhookEventId: record.webhook_event_id, status: deadLetter ? 'dead_letter' : 'retryable', error: message })
    }
  }

  logger.info('worker_batch_completed', { processed_count: processed.length })
  return Response.json({ function: 'plaid-webhook-worker', processedCount: processed.length, records: processed })
})
