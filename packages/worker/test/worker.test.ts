import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { googleConfigured } from '../src/auth'
import { assertAllowed } from '../src/membership'
import { isTruthy, listVar, type Env } from '../src/env'
import { isValidRoom } from '../src/routing'
import { joinSnapshot, snapshotKey, splitSnapshot, staleKeys } from '../src/snapshot'

const env = (overrides: Partial<Env> = {}): Env =>
  ({
    APP_URL: 'https://planner.example.com',
    MIND_MELD_ALLOWED_DOMAINS: '',
    MIND_MELD_ALLOWED_EMAILS: '',
    MIND_MELD_ALLOW_ANY_SIGNUP: '0',
    MAIL_FROM: 'Mind Meld <planner@example.com>',
    ANDROID_PACKAGE: '',
    ANDROID_FINGERPRINTS: '',
    ...overrides,
  }) as Env

describe('room names', () => {
  it('accepts the shapes this app creates', () => {
    expect(isValidRoom('workspace')).toBe(true)
    expect(isValidRoom('note_a1b2c3')).toBe(true)
    expect(isValidRoom('tasks_ABC-123_x')).toBe(true)
    expect(isValidRoom('table_0000')).toBe(true)
  })

  it('rejects anything else', () => {
    // Room names become storage names and appear in URLs, so traversal,
    // separators and unknown prefixes all have to be refused.
    expect(isValidRoom('../etc/passwd')).toBe(false)
    expect(isValidRoom('note_a/b')).toBe(false)
    expect(isValidRoom('other_abc')).toBe(false)
    expect(isValidRoom('note_')).toBe(false)
    expect(isValidRoom('')).toBe(false)
    expect(isValidRoom(`note_${'x'.repeat(49)}`)).toBe(false)
  })
})

describe('config parsing', () => {
  it('splits lists on commas and whitespace, and lowercases', () => {
    expect(listVar(' Example.com, other.org\n third.net ')).toEqual([
      'example.com',
      'other.org',
      'third.net',
    ])
    expect(listVar('')).toEqual([])
    expect(listVar(undefined)).toEqual([])
  })

  it('reads booleans conservatively', () => {
    expect(isTruthy('1')).toBe(true)
    expect(isTruthy('true')).toBe(true)
    expect(isTruthy('TRUE')).toBe(true)
    expect(isTruthy('0')).toBe(false)
    expect(isTruthy('yes')).toBe(false)
    expect(isTruthy(undefined)).toBe(false)
  })
})

describe('configuration contract', () => {
  // Replicability guard: a variable the Worker reads but no template mentions
  // is one a fresh clone can only discover by reading source. Every field of
  // Env must be named in wrangler.toml or .env.example.
  it('documents every Env field in wrangler.toml or .env.example', () => {
    const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const documented = read('wrangler.toml') + read('.env.example')
    const fields = [...read('src/env.ts').matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]!)
    expect(fields.length).toBeGreaterThan(0)
    const undocumented = fields.filter((field) => !documented.includes(field))
    expect(undocumented).toEqual([])
  })
})

describe('google provider detection', () => {
  it('is configured only when both halves of the credential exist', () => {
    expect(googleConfigured(env({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }))).toBe(
      true,
    )
    expect(googleConfigured(env({ GOOGLE_CLIENT_ID: 'id' }))).toBe(false)
    expect(googleConfigured(env({ GOOGLE_CLIENT_SECRET: 'secret' }))).toBe(false)
    expect(googleConfigured(env())).toBe(false)
    // An empty string is unset, not configured.
    expect(googleConfigured(env({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }))).toBe(false)
  })
})

describe('membership allowlist', () => {
  it('admits an allowed domain, whatever the casing', () => {
    const config = env({ MIND_MELD_ALLOWED_DOMAINS: 'example.com' })
    expect(() => assertAllowed(config, 'ana@example.com')).not.toThrow()
    expect(() => assertAllowed(config, 'Ana@Example.COM')).not.toThrow()
  })

  it('admits a specifically allowed address', () => {
    const config = env({ MIND_MELD_ALLOWED_EMAILS: 'ana@elsewhere.net' })
    expect(() => assertAllowed(config, 'ana@elsewhere.net')).not.toThrow()
    expect(() => assertAllowed(config, 'ben@elsewhere.net')).toThrow()
  })

  it('refuses an address outside the list', () => {
    const config = env({ MIND_MELD_ALLOWED_DOMAINS: 'example.com' })
    expect(() => assertAllowed(config, 'stranger@elsewhere.net')).toThrow()
  })

  it('is not fooled by a lookalike domain', () => {
    const config = env({ MIND_MELD_ALLOWED_DOMAINS: 'example.com' })
    expect(() => assertAllowed(config, 'attacker@notexample.com')).toThrow()
    expect(() => assertAllowed(config, 'attacker@example.com.evil.net')).toThrow()
    // An address whose local part merely mentions the domain is not a member.
    expect(() => assertAllowed(config, 'ana@example.com@evil.net')).toThrow()
  })

  it('refuses everyone when no allowlist is configured', () => {
    // An internet-reachable space that accepts any signup must be deliberate.
    expect(() => assertAllowed(env(), 'anyone@anywhere.net')).toThrow()
  })

  it('admits everyone only when explicitly told to', () => {
    const config = env({ MIND_MELD_ALLOW_ANY_SIGNUP: '1' })
    expect(() => assertAllowed(config, 'anyone@anywhere.net')).not.toThrow()
  })
})

describe('snapshot chunking', () => {
  const bytes = (length: number) =>
    Uint8Array.from({ length }, (_, index) => index % 251)

  it('round-trips a value smaller than one chunk', () => {
    const original = bytes(100)
    const chunks = splitSnapshot(original, 1024)
    expect(chunks).toHaveLength(1)
    expect(joinSnapshot(chunks)).toEqual(original)
  })

  it('round-trips a value spanning several chunks', () => {
    const original = bytes(4097)
    const chunks = splitSnapshot(original, 1024)
    expect(chunks).toHaveLength(5)
    expect(chunks.at(-1)!.byteLength).toBe(1)
    expect(joinSnapshot(chunks)).toEqual(original)
  })

  it('round-trips a value that divides exactly', () => {
    const original = bytes(2048)
    const chunks = splitSnapshot(original, 1024)
    expect(chunks).toHaveLength(2)
    expect(joinSnapshot(chunks)).toEqual(original)
  })

  it('produces no chunks for an empty update', () => {
    expect(splitSnapshot(new Uint8Array(0))).toEqual([])
    expect(joinSnapshot([])).toEqual(new Uint8Array(0))
  })

  it('round-trips a real Yjs document', () => {
    const doc = new Y.Doc()
    const tasks = doc.getMap('tasks')
    for (let index = 0; index < 200; index += 1) {
      const task = new Y.Map()
      task.set('id', `t${index}`)
      task.set('title', `Task number ${index} with some text to take up room`)
      tasks.set(`t${index}`, task)
    }

    const update = Y.encodeStateAsUpdate(doc)
    const restored = new Y.Doc()
    Y.applyUpdate(restored, joinSnapshot(splitSnapshot(update, 512)))
    expect(restored.getMap('tasks').size).toBe(200)
    expect((restored.getMap('tasks').get('t42') as Y.Map<unknown>).get('title')).toBe(
      'Task number 42 with some text to take up room',
    )
  })

  it('names the keys left over by a shrinking snapshot', () => {
    expect(staleKeys(5, 2)).toEqual([snapshotKey(2), snapshotKey(3), snapshotKey(4)])
    expect(staleKeys(2, 5)).toEqual([])
    expect(staleKeys(3, 3)).toEqual([])
  })

  it('rejects a nonsensical chunk size', () => {
    expect(() => splitSnapshot(bytes(10), 0)).toThrow()
  })
})
