import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('parse-document', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  const parseId = String(payload.document_parse_id ?? '')
  const householdId = String(payload.household_id ?? '')
  const documentUploadId = payload.document_upload_id ? String(payload.document_upload_id) : null

  if (!parseId || !householdId) {
    logger.warn('validation_failed', { reason: 'missing_document_parse_or_household' })
    return Response.json(
      { error: 'document_parse_id and household_id are required' },
      { status: 400 },
    )
  }

  const requestLogger = logger.child({ household_id: householdId, event_id: parseId })
  requestLogger.info('document_parse_ingest_requested')

  const { data, error } = await supabaseAdmin
    .from('document_parse_ingest')
    .insert({
      household_id: householdId,
      document_parse_id: parseId,
      document_upload_id: documentUploadId,
      payload,
    })
    .select('id, status, created_at')
    .single()

  if (error?.code === '23505') {
    const { data: existing } = await supabaseAdmin
      .from('document_parse_ingest')
      .select('id, status, created_at')
      .eq('document_parse_id', parseId)
      .single()

    requestLogger.info('document_parse_duplicate_ignored', { ingest_id: existing?.id })
    return Response.json({
      function: 'parse-document',
      status: 'duplicate_ignored',
      documentParseId: parseId,
      ingestId: existing?.id,
      ingestStatus: existing?.status,
      queuedAt: existing?.created_at,
    })
  }

  if (error) {
    requestLogger.error('document_parse_ingest_failed', { error: error.message })
    throw error
  }

  requestLogger.info('document_parse_ingested', { ingest_id: data.id, ingest_status: data.status })
  return Response.json({
    function: 'parse-document',
    status: 'accepted',
    documentParseId: parseId,
    ingestId: data.id,
    ingestStatus: data.status,
    queuedAt: data.created_at,
  })
})
