import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const querySchema = z.object({ household_id: z.string().uuid() })

const createSchema = z.object({
  household_id: z.string().uuid(),
  estimated_value: z.number().positive(),
  notes: z.string().nullable().optional(),
})

export async function GET(req: Request) {
  try {
    const { household_id } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('home_valuations')
      .select('id, estimated_value, valuation_date, notes')
      .eq('household_id', household_id)
      .order('valuation_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return errorResponse(400, { code: 'HOME_VALUATION_FETCH_FAILED', message: error.message, retryable: true })
    }

    return successResponse(data ?? null)
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
    const payload = await parseJson(req, createSchema)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Authentication required', retryable: false })
    }

    const { data, error } = await supabase
      .from('home_valuations')
      .insert({
        household_id: payload.household_id,
        estimated_value: payload.estimated_value,
        valuation_date: new Date().toISOString().slice(0, 10),
        notes: payload.notes ?? null,
        created_by: user.id,
      })
      .select('id, estimated_value, valuation_date, notes')
      .single()

    if (error) {
      return errorResponse(400, { code: 'HOME_VALUATION_CREATE_FAILED', message: error.message, retryable: false })
    }

    return successResponse(data, 201)
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
