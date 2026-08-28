import type { TaskStatus } from '../lib/types'

/**
 * Shared by the list and the detail panel. These live here rather than in
 * either component because importing one view from the other makes a cycle,
 * which fails at runtime as a temporal-dead-zone error rather than at build.
 */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export const STATUS_TONE: Record<TaskStatus, 'neutral' | 'accent' | 'warn' | 'ok'> = {
  todo: 'neutral',
  doing: 'accent',
  blocked: 'warn',
  done: 'ok',
}
