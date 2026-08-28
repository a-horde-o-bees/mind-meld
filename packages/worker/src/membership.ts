import { isTruthy, listVar, type Env } from './env'

/**
 * Who may hold an account in this space.
 *
 * Kept free of any Worker-runtime or framework imports so the policy can be
 * unit tested directly — it is the rule that decides who can reach every
 * document, and it should be readable and checkable on its own.
 */
export class MembershipError extends Error {}

export function assertAllowed(env: Env, email: string): void {
  const domains = listVar(env.MIND_MELD_ALLOWED_DOMAINS)
  const emails = listVar(env.MIND_MELD_ALLOWED_EMAILS)

  if (domains.length === 0 && emails.length === 0) {
    // Signup is genuinely open once email works, so an unconfigured space must
    // refuse everyone rather than quietly accept the whole internet.
    if (isTruthy(env.MIND_MELD_ALLOW_ANY_SIGNUP)) return
    throw new MembershipError(
      'This space has no member allowlist configured. Set MIND_MELD_ALLOWED_DOMAINS or MIND_MELD_ALLOWED_EMAILS, or set MIND_MELD_ALLOW_ANY_SIGNUP=1 to accept anyone.',
    )
  }

  const address = email.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  // No '@' at all is not an address this app can place on either list.
  const domain = at === -1 ? '' : address.slice(at + 1)

  if (emails.includes(address) || (domain !== '' && domains.includes(domain))) return

  throw new MembershipError('That address is not on this space’s member list.')
}
