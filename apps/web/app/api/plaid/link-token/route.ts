import { z } from 'zod'

import { errorResponse, parseJson } from '@/app/api/_lib/contracts'

const schema = z.object({
  household_id: z.string().uuid(),
})

export async function POST(req: Request) {
  try {
    await parseJson(req, schema)

    return errorResponse(501, {
      code: 'NOT_IMPLEMENTED',
      message: 'Plaid link-token generation is not implemented yet',
      retryable: false,
    })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
