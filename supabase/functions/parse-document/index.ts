import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const parseId = String(payload.document_parse_id ?? '')
  const householdId = String(payload.household_id ?? '')
  const documentUploadId = payload.document_upload_id ? String(payload.document_upload_id) : null

  if (!parseId || !householdId) {
    return Response.json(
      { error: 'document_parse_id and household_id are required' },
      { status: 400 },
    )
  }

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
    throw error
  }

  return Response.json({
    function: 'parse-document',
    status: 'accepted',
    documentParseId: parseId,
    ingestId: data.id,
    ingestStatus: data.status,
    queuedAt: data.created_at,
  })
})
