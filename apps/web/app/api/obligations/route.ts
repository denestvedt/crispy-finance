import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const listQuerySchema = z.object({
  household_id: z.string().uuid(),
  is_active: z.enum(['true', 'false']).optional(),
})

const createSchema = z.object({
  household_id: z.string().uuid(),
  name: z.string().min(1),
  obligation_type: z.enum(['recurring', 'irregular', 'contingent']),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'one_time']).optional(),
  estimated_amount: z.number().positive(),
  probability: z.number().min(0).max(1).default(1),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(req: Request) {
  try {
    const query = listQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()

    let qb = supabase
      .from('obligations')
      .select('id, name, obligation_type, estimated_amount, frequency, probability, next_due_date, is_active, created_at')
      .eq('household_id', query.household_id)
      .order('next_due_date', { ascending: true })

    if (query.is_active !== undefined) {
      qb = qb.eq('is_active', query.is_active === 'true')
    }

    const { data, error } = await qb

    if (error) {
      return errorResponse(400, { code: 'OBLIGATIONS_FETCH_FAILED', message: error.message, retryable: true })
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
    const payload = await parseJson(req, createSchema)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Authentication required', retryable: false })
    }

    const { data: membership } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', payload.household_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return errorResponse(403, { code: 'FORBIDDEN', message: 'Not a member of this household', retryable: false })
    }

    const { data, error } = await supabase
      .from('obligations')
      .insert({
        household_id: payload.household_id,
        name: payload.name,
        obligation_type: payload.obligation_type,
        frequency: payload.frequency ?? null,
        estimated_amount: payload.estimated_amount,
        probability: payload.probability,
        next_due_date: payload.next_due_date ?? null,
        is_active: true,
      })
      .select('id, name, obligation_type, estimated_amount, frequency, probability, next_due_date, is_active, created_at')
      .single()

    if (error) {
      return errorResponse(400, { code: 'OBLIGATION_CREATE_FAILED', message: error.message, retryable: false })
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
