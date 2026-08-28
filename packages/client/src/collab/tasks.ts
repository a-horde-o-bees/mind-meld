import * as Y from 'yjs'
import { byOrder, keyBetween } from '../lib/fractional'
import type { Comment, Person, Subtask, Task, TaskPriority, TaskStatus } from '../lib/types'
import { makeId } from './docs'

/**
 * Task list document.
 *
 * Tasks live in a Y.Map keyed by id and are ordered by a fractional index
 * string, never by array position. That is what keeps manual reordering safe
 * when two people drag at the same time: each move rewrites one field on one
 * task instead of splicing a shared array.
 */

export function tasksMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('tasks')
}

function entryFor(doc: Y.Doc, id: string): Y.Map<unknown> | undefined {
  return tasksMap(doc).get(id)
}

function toTask(entry: Y.Map<unknown>): Task | null {
  const id = entry.get('id')
  const order = entry.get('order')
  if (typeof id !== 'string' || typeof order !== 'string') return null
  const tags = entry.get('tags')
  return {
    id,
    order,
    title: (entry.get('title') as string) ?? '',
    status: ((entry.get('status') as TaskStatus) ?? 'todo'),
    priority: ((entry.get('priority') as TaskPriority) ?? 'medium'),
    assignee: (entry.get('assignee') as Person | null) ?? null,
    due: (entry.get('due') as string | null) ?? null,
    tags: tags instanceof Y.Array ? (tags.toArray() as string[]) : [],
    createdAt: (entry.get('createdAt') as number) ?? 0,
    updatedAt: (entry.get('updatedAt') as number) ?? 0,
  }
}

export function listTasks(doc: Y.Doc): Task[] {
  const tasks: Task[] = []
  for (const entry of tasksMap(doc).values()) {
    const task = toTask(entry)
    if (task) tasks.push(task)
  }
  return tasks.sort(byOrder)
}

export function getTask(doc: Y.Doc, id: string): Task | null {
  const entry = entryFor(doc, id)
  return entry ? toTask(entry) : null
}

export function createTask(doc: Y.Doc, title: string, atIndex?: number): Task {
  const existing = listTasks(doc)
  const index = atIndex ?? existing.length
  const before = index > 0 ? existing[index - 1]?.order ?? null : null
  const after = index < existing.length ? existing[index]?.order ?? null : null
  const now = Date.now()
  const id = makeId()

  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('id', id)
    entry.set('title', title)
    entry.set('status', 'todo')
    entry.set('priority', 'medium')
    entry.set('order', keyBetween(before, after))
    entry.set('assignee', null)
    entry.set('due', null)
    entry.set('tags', new Y.Array<string>())
    entry.set('subtasks', new Y.Map<Y.Map<unknown>>())
    entry.set('comments', new Y.Array<Y.Map<unknown>>())
    entry.set('createdAt', now)
    entry.set('updatedAt', now)
    // The description is a ProseMirror binding target, created up front so the
    // editor never has to mutate the document just by being opened.
    entry.set('description', new Y.XmlFragment())
    tasksMap(doc).set(id, entry)
  })

  return getTask(doc, id)!
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'tags'>>

export function updateTask(doc: Y.Doc, id: string, patch: TaskPatch): void {
  const entry = entryFor(doc, id)
  if (!entry) return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value)
    }
    entry.set('updatedAt', Date.now())
  })
}

export function deleteTask(doc: Y.Doc, id: string): void {
  tasksMap(doc).delete(id)
}

/** Move a task to a position within the list as currently displayed. */
export function moveTask(doc: Y.Doc, id: string, targetIndex: number): void {
  const others = listTasks(doc).filter((task) => task.id !== id)
  const index = Math.max(0, Math.min(targetIndex, others.length))
  const before = index > 0 ? others[index - 1]!.order : null
  const after = index < others.length ? others[index]!.order : null
  updateTask(doc, id, { order: keyBetween(before, after) })
}

/** Move a task one place up or down among the tasks it is displayed with. */
export function nudgeTask(doc: Y.Doc, visible: readonly Task[], id: string, delta: number): void {
  const from = visible.findIndex((task) => task.id === id)
  if (from === -1) return
  const to = from + delta
  if (to < 0 || to >= visible.length) return

  const neighbour = visible[to]!
  const beyond = visible[delta > 0 ? to + 1 : to - 1] ?? null
  const [before, after] =
    delta > 0 ? [neighbour.order, beyond?.order ?? null] : [beyond?.order ?? null, neighbour.order]
  updateTask(doc, id, { order: keyBetween(before, after) })
}

export function description(doc: Y.Doc, taskId: string): Y.XmlFragment | null {
  const entry = entryFor(doc, taskId)
  const fragment = entry?.get('description')
  return fragment instanceof Y.XmlFragment ? fragment : null
}

/* ---------------------------------------------------------------- tags --- */

export function tagsOf(doc: Y.Doc, taskId: string): Y.Array<string> | null {
  const value = entryFor(doc, taskId)?.get('tags')
  return value instanceof Y.Array ? (value as Y.Array<string>) : null
}

export function addTag(doc: Y.Doc, taskId: string, tag: string): void {
  const trimmed = tag.trim()
  const tags = tagsOf(doc, taskId)
  if (!tags || trimmed === '' || tags.toArray().includes(trimmed)) return
  tags.push([trimmed])
  updateTask(doc, taskId, {})
}

export function removeTag(doc: Y.Doc, taskId: string, tag: string): void {
  const tags = tagsOf(doc, taskId)
  if (!tags) return
  const index = tags.toArray().indexOf(tag)
  if (index >= 0) tags.delete(index, 1)
  updateTask(doc, taskId, {})
}

/* ------------------------------------------------------------ subtasks --- */

function subtasksMap(doc: Y.Doc, taskId: string): Y.Map<Y.Map<unknown>> | null {
  const value = entryFor(doc, taskId)?.get('subtasks')
  return value instanceof Y.Map ? (value as Y.Map<Y.Map<unknown>>) : null
}

export function listSubtasks(doc: Y.Doc, taskId: string): Subtask[] {
  const map = subtasksMap(doc, taskId)
  if (!map) return []
  const out: Subtask[] = []
  for (const entry of map.values()) {
    const id = entry.get('id')
    const order = entry.get('order')
    if (typeof id !== 'string' || typeof order !== 'string') continue
    out.push({
      id,
      order,
      title: (entry.get('title') as string) ?? '',
      done: Boolean(entry.get('done')),
    })
  }
  return out.sort(byOrder)
}

export function addSubtask(doc: Y.Doc, taskId: string, title: string): void {
  const map = subtasksMap(doc, taskId)
  if (!map) return
  const last = listSubtasks(doc, taskId).at(-1)?.order ?? null
  const id = makeId()
  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('id', id)
    entry.set('title', title)
    entry.set('done', false)
    entry.set('order', keyBetween(last, null))
    map.set(id, entry)
  })
  updateTask(doc, taskId, {})
}

export function updateSubtask(
  doc: Y.Doc,
  taskId: string,
  subtaskId: string,
  patch: Partial<Subtask>,
): void {
  const entry = subtasksMap(doc, taskId)?.get(subtaskId)
  if (!entry) return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value)
    }
  })
  updateTask(doc, taskId, {})
}

export function deleteSubtask(doc: Y.Doc, taskId: string, subtaskId: string): void {
  subtasksMap(doc, taskId)?.delete(subtaskId)
  updateTask(doc, taskId, {})
}

export function moveSubtask(doc: Y.Doc, taskId: string, subtaskId: string, targetIndex: number): void {
  const others = listSubtasks(doc, taskId).filter((subtask) => subtask.id !== subtaskId)
  const index = Math.max(0, Math.min(targetIndex, others.length))
  const before = index > 0 ? others[index - 1]!.order : null
  const after = index < others.length ? others[index]!.order : null
  updateSubtask(doc, taskId, subtaskId, { order: keyBetween(before, after) })
}

/* ------------------------------------------------------------ comments --- */

function commentsArray(doc: Y.Doc, taskId: string): Y.Array<Y.Map<unknown>> | null {
  const value = entryFor(doc, taskId)?.get('comments')
  return value instanceof Y.Array ? (value as Y.Array<Y.Map<unknown>>) : null
}

export function listComments(doc: Y.Doc, taskId: string): Comment[] {
  const array = commentsArray(doc, taskId)
  if (!array) return []
  return array
    .toArray()
    .map((entry) => ({
      id: (entry.get('id') as string) ?? '',
      body: (entry.get('body') as string) ?? '',
      authorId: (entry.get('authorId') as string) ?? '',
      authorName: (entry.get('authorName') as string) ?? 'Someone',
      createdAt: (entry.get('createdAt') as number) ?? 0,
    }))
    .filter((comment) => comment.id !== '')
}

export function addComment(doc: Y.Doc, taskId: string, body: string, author: Person): void {
  const array = commentsArray(doc, taskId)
  const trimmed = body.trim()
  if (!array || trimmed === '') return
  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('id', makeId())
    entry.set('body', trimmed)
    entry.set('authorId', author.id)
    entry.set('authorName', author.name)
    entry.set('createdAt', Date.now())
    array.push([entry])
  })
  updateTask(doc, taskId, {})
}

export function deleteComment(doc: Y.Doc, taskId: string, commentId: string): void {
  const array = commentsArray(doc, taskId)
  if (!array) return
  const index = array.toArray().findIndex((entry) => entry.get('id') === commentId)
  if (index >= 0) array.delete(index, 1)
  updateTask(doc, taskId, {})
}
