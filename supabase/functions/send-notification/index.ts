import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM_ADDRESS') ?? 'notifications@householdcfo.com'
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@householdcfo.com'

interface NotificationPayload {
  type: string
  household_id: string
  user_id: string
  title: string
  body: string
  data?: Record<string, unknown>
}

async function sendEmail(to: string, title: string, body: string): Promise<void> {
  if (!RESEND_API_KEY) return

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: title,
      text: body,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend API error ${res.status}: ${text}`)
  }
}

/**
 * Encode a string to base64url (no padding) as required by VAPID / Web Push.
 */
function base64urlEncode(data: Uint8Array): string {
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create a minimal VAPID JWT for Web Push authorization.
 * See: https://datatracker.ietf.org/doc/html/rfc8292
 */
async function createVapidJwt(audience: string): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT }),
    ),
  )

  const keyData = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const sigInput = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, sigInput)
  const sigEncoded = base64urlEncode(new Uint8Array(signature))

  return `${header}.${payload}.${sigEncoded}`
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { auth: string; p256dh: string } },
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) return

  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt = await createVapidJwt(audience)

  const message = JSON.stringify({ title, body, data: data ?? {} })
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': String(messageBytes.byteLength),
      'TTL': '86400',
    },
    body: messageBytes,
  })

  if (!res.ok && res.status !== 201) {
    const text = await res.text()
    throw new Error(`Web Push error ${res.status}: ${text}`)
  }
}

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('send-notification', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  const { type, household_id, user_id, title, body: bodyText, data } = payload as NotificationPayload

  if (!type || !household_id || !user_id || !title || !bodyText) {
    logger.warn('validation_failed', { reason: 'missing_required_fields' })
    return Response.json({ error: 'type, household_id, user_id, title, and body are required' }, { status: 400 })
  }

  const notifLogger = logger.child({ household_id, user_id, type })

  // 1. Check user notification preferences for threshold-based types
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('email_enabled, push_enabled')
    .eq('user_id', user_id)
    .maybeSingle()

  const emailEnabled = prefs?.email_enabled ?? true
  const pushEnabled = prefs?.push_enabled ?? true

  // 2. Insert notification record
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('notifications')
    .insert({
      household_id,
      user_id,
      type,
      title,
      body: bodyText,
      data: data ?? null,
      is_read: false,
    })
    .select('id')
    .single()

  if (insertError) {
    notifLogger.error('notification_insert_failed', { error: insertError.message })
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  notifLogger.info('notification_inserted', { notification_id: inserted.id })

  let emailSent = false
  let pushSent = false

  // 3. Send email if enabled
  if (emailEnabled) {
    const { data: userRecord } = await supabaseAdmin.auth.admin.getUserById(user_id)
    const userEmail = userRecord?.user?.email

    if (userEmail) {
      try {
        await sendEmail(userEmail, title, bodyText)
        emailSent = true
        notifLogger.info('email_sent', { to: userEmail })

        await supabaseAdmin
          .from('notifications')
          .update({ sent_email: true })
          .eq('id', inserted.id)
      } catch (err) {
        notifLogger.error('email_send_failed', { error: (err as Error).message })
      }
    }
  }

  // 4. Send Web Push if enabled
  if (pushEnabled) {
    const { data: subscriptions } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user_id)

    for (const sub of subscriptions ?? []) {
      try {
        await sendWebPush(sub as { endpoint: string; keys: { auth: string; p256dh: string } }, title, bodyText, data)
        pushSent = true
        notifLogger.info('push_sent', { endpoint: (sub as { endpoint: string }).endpoint })
      } catch (err) {
        notifLogger.error('push_send_failed', { error: (err as Error).message })
      }
    }

    if (pushSent) {
      await supabaseAdmin.from('notifications').update({ sent_push: true }).eq('id', inserted.id)
    }
  }

  notifLogger.info('notification_dispatched', { email_sent: emailSent, push_sent: pushSent })

  return Response.json({
    function: 'send-notification',
    status: 'dispatched',
    notification_id: inserted.id,
    email_sent: emailSent,
    push_sent: pushSent,
  })
})
