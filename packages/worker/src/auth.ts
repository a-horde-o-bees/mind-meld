import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { listVar, type Env } from './env'
import { assertAllowed, MembershipError } from './membership'
import { actionEmail, sendMail } from './mailer'

const DAY = 60 * 60 * 24

export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
}

/**
 * Better Auth is configured per request because its bindings (D1, secrets) only
 * exist on the request's `env`. The instance is memoised per `env` object so a
 * single request that touches auth several times builds it once.
 */
const cache = new WeakMap<Env, ReturnType<typeof build>>()

export function getAuth(env: Env) {
  let auth = cache.get(env)
  if (!auth) {
    auth = build(env)
    cache.set(env, auth)
  }
  return auth
}

/**
 * Whether Google sign-in is live. The single truth shared by the Better Auth
 * provider registration below and `/api/config`, so the client's button can
 * never disagree with what the server accepts.
 */
export function googleConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

function build(env: Env) {
  const google = googleConfigured(env)
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {}

  return betterAuth({
    appName: 'Mind Meld',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET ?? 'dev-only-insecure-secret-change-me',
    database: env.DB,
    // The deployed origin, plus any extra dev origins (the Vite server runs on
    // its own port and proxies here, so its origin arrives on every request).
    trustedOrigins: [env.APP_URL, ...listVar(env.MIND_MELD_EXTRA_ORIGINS)],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(env, {
          to: user.email,
          subject: 'Reset your Mind Meld password',
          ...actionEmail(
            'Reset your password',
            'Someone asked to reset the password for this account. If that was not you, ignore this message and nothing changes.',
            url,
            'Choose a new password',
          ),
        })
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(env, {
          to: user.email,
          subject: 'Confirm your Mind Meld address',
          ...actionEmail(
            'Confirm your email address',
            'Confirm this address to finish setting up your Mind Meld account.',
            url,
            'Confirm address',
          ),
        })
      },
    },

    socialProviders: google,

    session: {
      // Sliding window: an active teammate is never signed out, while a device
      // left idle for two months stops being a way in.
      expiresIn: 60 * DAY,
      updateAge: 1 * DAY,
    },

    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        // Persistent rather than browser-session scoped, so "stay logged in"
        // survives closing the app or restarting the phone.
        secure: env.APP_URL.startsWith('https://'),
      },
    },

    hooks: {
      // Reject a disallowed address while it is still a request, so the caller
      // gets a 403 that says why. The database hook below also refuses to
      // create the row, but on its own it answers 200 with an unsaved user —
      // which reads to the client as a successful signup.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return
        const email = (ctx.body as { email?: unknown } | undefined)?.email
        if (typeof email === 'string') enforceMembership(env, email)
      }),
    },

    databaseHooks: {
      user: {
        create: {
          // Defence in depth, and the only gate on the Google path: the address
          // is not known until the provider hands it back.
          before: async (user) => {
            enforceMembership(env, user.email)
            return { data: user }
          },
        },
      },
    },
  })
}

/**
 * Apply the membership policy, reporting a refusal in the shape Better Auth
 * turns into a 403 with a readable message.
 */
function enforceMembership(env: Env, email: string): void {
  try {
    assertAllowed(env, email)
  } catch (err) {
    if (err instanceof MembershipError) {
      throw new APIError('FORBIDDEN', { message: err.message })
    }
    throw err
  }
}

/** Resolve the signed-in user for a request, or null when there is no valid session. */
export async function getSessionUser(env: Env, request: Request): Promise<SessionUser | null> {
  const session = await getAuth(env).api.getSession({ headers: request.headers })
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name || session.user.email,
    email: session.user.email,
    image: session.user.image ?? null,
  }
}
