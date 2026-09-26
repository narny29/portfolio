import { NextRequest, NextResponse } from 'next/server'

export const LIMITS = {
  email: 254,
  subject: 200,
  body: 4000,
  date: 32,
  time: 16,
  isoDateTime: 40,
  requestsPerWindow: 8,
  windowMs: 15 * 60 * 1000,
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > LIMITS.email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
}

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

const hits = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(
  key: string,
  limit = LIMITS.requestsPerWindow,
  windowMs = LIMITS.windowMs
): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count += 1
  return true
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export function isJsonContentType(request: NextRequest): boolean {
  const contentType = request.headers.get('content-type') || ''
  return contentType.toLowerCase().includes('application/json')
}

/** Same-host requests pass. Extra origins can be listed in ALLOWED_ORIGIN. */
export function isAllowedRequestOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  let requestOrigin: string | null = null
  if (originHeader) {
    requestOrigin = originHeader.replace(/\/$/, '')
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin
    } catch {
      return false
    }
  }

  if (!requestOrigin) {
    return process.env.REQUIRE_ORIGIN !== 'true'
  }

  try {
    const parsed = new URL(requestOrigin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    if (host && parsed.host === host) {
      return true
    }
  } catch {
    return false
  }

  const extras = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return extras.includes(requestOrigin)
}

export function missingEnv(keys: string[]): string | null {
  const missing = keys.filter((key) => !process.env[key]?.trim())
  return missing.length ? missing.join(', ') : null
}

export function withinLength(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}
