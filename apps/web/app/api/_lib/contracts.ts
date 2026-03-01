import { ZodError } from 'zod'
import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import type { ApiResult, ErrorEnvelope } from '@household-cfo/types'

export const errorResponse = (status: number, error: Omit<ErrorEnvelope, 'correlation_id'>, correlationId?: string) => {
  const envelope: ErrorEnvelope = {
    ...error,
    correlation_id: correlationId ?? randomUUID(),
  }

  return NextResponse.json<ApiResult<never>>({ ok: false, error: envelope }, { status })
}

export const successResponse = <T>(data: T, status = 200) =>
  NextResponse.json<ApiResult<T>>({ ok: true, data }, { status })

export const parseJson = async <T>(req: Request, schema: { parse: (value: unknown) => T }) => {
  const body = await req.json().catch(() => {
    throw new ZodError([
      {
        code: 'custom',
        message: 'Invalid JSON body',
        path: [],
      },
    ])
  })

  return schema.parse(body)
}
