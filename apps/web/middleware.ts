import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

type WindowConfig = {
  limit: number
  windowMs: number
}

type Bucket = {
  count: number
  resetAt: number
}

const RATE_LIMIT_CONFIG: Record<string, WindowConfig> = {
  auth: { limit: 12, windowMs: 60_000 },
  webhook: { limit: 120, windowMs: 60_000 },
}

const globalRateLimitStore = globalThis as typeof globalThis & {
  __rateLimitBuckets?: Map<string, Bucket>
}

const buckets = globalRateLimitStore.__rateLimitBuckets ?? new Map<string, Bucket>()
globalRateLimitStore.__rateLimitBuckets = buckets

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown'
  }

  return request.ip ?? 'unknown'
}

function rateLimit(request: NextRequest, keyPrefix: keyof typeof RATE_LIMIT_CONFIG) {
  const now = Date.now()
  const config = RATE_LIMIT_CONFIG[keyPrefix]
  const bucketKey = `${keyPrefix}:${getClientIp(request)}`
  const current = buckets.get(bucketKey)

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + config.windowMs,
    })

    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + config.windowMs,
    }
  }

  if (current.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    }
  }

  current.count += 1
  buckets.set(bucketKey, current)

  return {
    allowed: true,
    remaining: config.limit - current.count,
    resetAt: current.resetAt,
  }
}

function applyRateLimitHeaders(response: NextResponse, result: { remaining: number; resetAt: number }) {
  response.headers.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining)))
  response.headers.set('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)))
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/auth')) {
    const result = rateLimit(request, 'auth')
    if (!result.allowed) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many authentication attempts. Please retry shortly.',
              retryable: true,
            },
          },
          { status: 429 },
        ),
        result,
      )
    }

    return applyRateLimitHeaders(NextResponse.next(), result)
  }

  if (pathname.startsWith('/api/plaid/webhook')) {
    const result = rateLimit(request, 'webhook')
    if (!result.allowed) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Webhook rate limit exceeded. Retry in the next minute window.',
              retryable: true,
            },
          },
          { status: 429 },
        ),
        result,
      )
    }

    return applyRateLimitHeaders(NextResponse.next(), result)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/auth/:path*', '/api/plaid/webhook/:path*'],
}
