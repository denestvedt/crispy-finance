import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('send-notification', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  logger.info('notification_placeholder_called')
  return Response.json({ function: 'send-notification', status: 'todo' })
})
