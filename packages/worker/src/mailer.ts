import type { Env } from './env'

export interface Mail {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Transactional email.
 *
 * Cloudflare has no outbound email product — Email Routing is inbound only, and
 * Workers cannot speak SMTP — so this goes out over Resend's HTTP API. With no
 * API key configured the message is logged instead, which keeps signup
 * verification and password reset exercisable under `wrangler dev`.
 */
export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(
      `[mail] (no RESEND_API_KEY, not sent)\n  to: ${mail.to}\n  subject: ${mail.subject}\n  ${mail.text}`,
    )
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  })

  if (!response.ok) {
    // Surface the provider's reason: a bounced verification mail otherwise
    // looks to the user like a broken signup with no explanation anywhere.
    throw new Error(`resend rejected the message (${response.status}): ${await response.text()}`)
  }
}

/** Minimal, legible HTML for the two mails this app sends. */
export function actionEmail(heading: string, body: string, url: string, cta: string): Pick<Mail, 'html' | 'text'> {
  return {
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
  <h2 style="margin:0 0 12px">${heading}</h2>
  <p style="margin:0 0 20px">${body}</p>
  <p style="margin:0 0 20px"><a href="${url}" style="background:#3b6ef6;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${cta}</a></p>
  <p style="margin:0;color:#666;font-size:13px">If the button does not work, paste this link into your browser:<br>${url}</p>
</div>`,
    text: `${heading}\n\n${body}\n\n${cta}: ${url}\n`,
  }
}
