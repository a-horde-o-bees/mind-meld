/**
 * Room-name rules, kept free of Worker-runtime imports so they can be tested
 * directly.
 *
 * A room name is a Durable Object name and a URL path segment, so it is
 * restricted to exactly the shapes this app creates.
 */
const ROOM_PATTERN = /^(workspace|(?:note|tasks|table)_[A-Za-z0-9_-]{1,48})$/

export function isValidRoom(name: string): boolean {
  return ROOM_PATTERN.test(name)
}
