import type { DocRoom } from './room'

export interface Env {
  DocRoom: DurableObjectNamespace<DocRoom>
  DB: D1Database
  ASSETS: Fetcher

  APP_URL: string
  /** Allowlist values arrive as per-Worker secrets, so deployments without them exist. */
  MIND_MELD_ALLOWED_DOMAINS?: string
  MIND_MELD_ALLOWED_EMAILS?: string
  MIND_MELD_ALLOW_ANY_SIGNUP: string
  MAIL_FROM: string
  ANDROID_PACKAGE: string
  ANDROID_FINGERPRINTS: string
  /** Extra trusted origins, comma separated. For local development only. */
  MIND_MELD_EXTRA_ORIGINS?: string
  /** Optional override for how often live sockets re-check their session. */
  MIND_MELD_SESSION_RECHECK_MS?: string

  BETTER_AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_KEY?: string
}

/** Split a comma/whitespace separated config value into trimmed entries. */
export function listVar(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isTruthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}
