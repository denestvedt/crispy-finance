import { supabaseAdmin } from './client.ts'

export type IdempotencySource = 'plaid_transaction' | 'plaid_webhook' | 'document_parse'

export const reserveIdempotencyKey = async (params: {
  householdId?: string
  source: IdempotencySource
  sourceEventId: string
  payloadHash?: string
}) => {
  const { data, error } = await supabaseAdmin
    .from('ingestion_idempotency_keys')
    .insert({
      household_id: params.householdId ?? null,
      source: params.source,
      source_event_id: params.sourceEventId,
      payload_hash: params.payloadHash ?? null,
    })
    .select('id')
    .single()

  if (!error && data) {
    return { isDuplicate: false, idempotencyRowId: data.id as string }
  }

  if (error?.code === '23505') {
    await supabaseAdmin
      .from('ingestion_idempotency_keys')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('source', params.source)
      .eq('source_event_id', params.sourceEventId)

    return { isDuplicate: true as const }
  }

  throw error ?? new Error('Unknown idempotency reservation error')
}
