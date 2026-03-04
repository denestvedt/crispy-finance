import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'

const querySchema = z.object({
  household_id: z.string().uuid(),
})

const createSchema = z.object({
  household_id: z.string().uuid(),
  file_name: z.string().min(1),
  file_type: z.string().min(1),
  storage_path: z.string().min(1),
})

export async function GET(req: Request) {
  try {
    const { household_id } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('document_uploads')
      .select('id, file_name, file_type, parse_status, parsed_entries_count, error_message, created_at')
      .eq('household_id', household_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return errorResponse(400, { code: 'DOCUMENTS_FETCH_FAILED', message: error.message, retryable: true })
    }

    return successResponse(data ?? [])
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid query',
      retryable: false,
    })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return errorResponse(401, { code: 'UNAUTHORIZED', message: 'Not authenticated', retryable: false })

    const body = await req.json()
    const payload = createSchema.parse(body)

    // Verify household membership
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('household_id', payload.household_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return errorResponse(403, { code: 'FORBIDDEN', message: 'Not a household member', retryable: false })
    }

    const { data, error } = await supabase
      .from('document_uploads')
      .insert({
        household_id: payload.household_id,
        uploaded_by: user.id,
        file_name: payload.file_name,
        file_type: payload.file_type,
        storage_path: payload.storage_path,
        parse_status: 'pending',
      })
      .select('id, file_name, file_type, parse_status, parsed_entries_count, created_at')
      .single()

    if (error) {
      return errorResponse(400, { code: 'DOCUMENT_CREATE_FAILED', message: error.message, retryable: false })
    }

    return successResponse(data, 201)
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request',
      retryable: false,
    })
  }
}
