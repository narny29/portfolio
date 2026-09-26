import { randomUUID } from 'crypto'

/**
 * In-memory session tokens + global email send window.
 *
 * Deliberately simple, single-process state for a low-traffic portfolio:
 * - A token is issued per page load; at most 250 stay active (FIFO eviction
 *   of the earliest-issued token when the cap is hit).
 * - The email route additionally enforces a global 2 sends/minute window so
 *   Gmail never sees a spam burst from this site.
 *
 * Note: like any in-memory store, state resets on server restart and is
 * per-instance on serverless hosts — acceptable here; clients recover by
 * refetching a token when the API reports TOKEN_INVALID.
 */

const MAX_ACTIVE_TOKENS = 250

// Map preserves insertion order, so keys() iterates oldest-first: the head
// of the queue is the token issued earliest.
const tokens = new Map<string, { createdAt: number; lastUsedAt: number }>()

export function issueToken(): string {
  if (tokens.size >= MAX_ACTIVE_TOKENS) {
    const oldest = tokens.keys().next().value
    if (oldest !== undefined) tokens.delete(oldest)
  }
  const token = randomUUID()
  tokens.set(token, { createdAt: Date.now(), lastUsedAt: Date.now() })
  return token
}

export function isValidToken(token: string): boolean {
  const entry = tokens.get(token)
  if (!entry) return false
  entry.lastUsedAt = Date.now()
  return true
}

const EMAIL_SENDS_PER_WINDOW = 2
const EMAIL_WINDOW_MS = 60 * 1000

const sendTimestamps: number[] = []

export type EmailSendReservation =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number }

/**
 * Reserves a slot in the global 2-per-minute email window. Call only after
 * request validation passes and immediately before actually sending, so
 * rejected attempts never consume Gmail quota.
 */
export function reserveEmailSendSlot(): EmailSendReservation {
  const now = Date.now()
  while (sendTimestamps.length > 0 && now - sendTimestamps[0] >= EMAIL_WINDOW_MS) {
    sendTimestamps.shift()
  }
  if (sendTimestamps.length >= EMAIL_SENDS_PER_WINDOW) {
    const retryAfterMs = sendTimestamps[0] + EMAIL_WINDOW_MS - now + 1000
    return { allowed: false, retryAfterMs }
  }
  sendTimestamps.push(now)
  return { allowed: true }
}
