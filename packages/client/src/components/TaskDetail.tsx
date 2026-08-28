import { useMemo, useState } from 'react'
import type { DocHandle } from '../collab/docs'
import { useYValue } from '../collab/hooks'
import {
  addComment,
  addSubtask,
  addTag,
  deleteComment,
  deleteSubtask,
  description,
  listComments,
  listSubtasks,
  removeTag,
  tasksMap,
  updateSubtask,
  updateTask,
} from '../collab/tasks'
import { usePresence } from '../collab/presence'
import { relativeTime, todayIso } from '../lib/format'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Person,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../lib/types'
import { RichTextEditor } from './RichTextEditor'
import { Avatar, Chip, InlineText, Menu } from './ui'
import { STATUS_LABELS } from './task-labels'

/**
 * The "open for more robust info" half of a task list: everything that would
 * clutter a row, including a full collaborative description, an ordered
 * checklist and a comment thread.
 */
export function TaskDetail({
  task,
  handle,
  self,
  onClose,
  onDelete,
}: {
  task: Task
  handle: DocHandle
  self: Person
  onClose: () => void
  onDelete: () => void
}) {
  const doc = handle.doc
  const map = tasksMap(doc)
  const subtasks = useYValue(map, () => listSubtasks(doc, task.id), [doc, task.id])
  const comments = useYValue(map, () => listComments(doc, task.id), [doc, task.id])
  const fragment = useMemo(() => description(doc, task.id), [doc, task.id])
  const others = usePresence(handle, self)
  const people = useMemo(() => dedupe([self, ...others, ...(task.assignee ? [task.assignee] : [])]), [self, others, task.assignee])

  const [newSubtask, setNewSubtask] = useState('')
  const [newTag, setNewTag] = useState('')
  const [newComment, setNewComment] = useState('')

  const doneCount = subtasks.filter((subtask) => subtask.done).length

  return (
    <aside className="detail" aria-label="Task details">
      <header className="detail__header">
        <h2 className="detail__heading">Task</h2>
        <div className="detail__header-actions">
          <Menu label="⋯" title="Task actions" align="right">
            {(close) => (
              <button type="button" className="is-danger" onClick={() => { onDelete(); close() }}>
                Delete task
              </button>
            )}
          </Menu>
          <button type="button" className="button button--ghost" onClick={onClose} aria-label="Close details">
            ×
          </button>
        </div>
      </header>

      <div className="detail__body">
        <InlineText
          value={task.title}
          onChange={(title) => updateTask(doc, task.id, { title })}
          placeholder="Untitled task"
          className="detail__title"
          ariaLabel="Task title"
        />

        <dl className="fields">
          <Field label="Status">
            <select
              value={task.status}
              aria-label="Status"
              onChange={(event) => updateTask(doc, task.id, { status: event.target.value as TaskStatus })}
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              value={task.priority}
              aria-label="Priority"
              onChange={(event) =>
                updateTask(doc, task.id, { priority: event.target.value as TaskPriority })
              }
            >
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assignee">
            <select
              value={task.assignee?.id ?? ''}
              aria-label="Assignee"
              onChange={(event) => {
                const person = people.find((candidate) => candidate.id === event.target.value) ?? null
                updateTask(doc, task.id, { assignee: person })
              }}
            >
              <option value="">Unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            {task.assignee && <Avatar person={task.assignee} size={22} />}
          </Field>

          <Field label="Due">
            <input
              type="date"
              aria-label="Due date"
              value={task.due ?? ''}
              onChange={(event) => updateTask(doc, task.id, { due: event.target.value || null })}
            />
            {!task.due && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => updateTask(doc, task.id, { due: todayIso() })}
              >
                Today
              </button>
            )}
          </Field>

          <Field label="Tags">
            <div className="tags">
              {task.tags.map((tag) => (
                <Chip key={tag} onRemove={() => removeTag(doc, task.id, tag)}>
                  {tag}
                </Chip>
              ))}
              <input
                className="tags__input"
                value={newTag}
                placeholder="Add tag"
                aria-label="Add tag"
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  addTag(doc, task.id, newTag)
                  setNewTag('')
                }}
              />
            </div>
          </Field>
        </dl>

        <section className="detail__section">
          <h3>Description</h3>
          {fragment ? (
            <RichTextEditor fragment={fragment} handle={handle} placeholder="Add detail" compact />
          ) : (
            <p className="detail__hint">Loading…</p>
          )}
        </section>

        <section className="detail__section">
          <h3>
            Checklist{' '}
            {subtasks.length > 0 && (
              <span className="detail__count">
                {doneCount}/{subtasks.length}
              </span>
            )}
          </h3>
          <ul className="subtasks">
            {subtasks.map((subtask) => (
              <li key={subtask.id} className={subtask.done ? 'is-done' : ''}>
                <input
                  type="checkbox"
                  checked={subtask.done}
                  aria-label={`Mark ${subtask.title} ${subtask.done ? 'not done' : 'done'}`}
                  onChange={(event) =>
                    updateSubtask(doc, task.id, subtask.id, { done: event.target.checked })
                  }
                />
                <InlineText
                  value={subtask.title}
                  onChange={(title) => updateSubtask(doc, task.id, subtask.id, { title })}
                  ariaLabel="Checklist item"
                />
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => deleteSubtask(doc, task.id, subtask.id)}
                  aria-label="Remove checklist item"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <input
            className="subtasks__input"
            value={newSubtask}
            placeholder="Add a step"
            aria-label="Add a step"
            onChange={(event) => setNewSubtask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || newSubtask.trim() === '') return
              addSubtask(doc, task.id, newSubtask.trim())
              setNewSubtask('')
            }}
          />
        </section>

        <section className="detail__section">
          <h3>Comments</h3>
          <ul className="comments">
            {comments.map((comment) => (
              <li key={comment.id}>
                <div className="comments__meta">
                  <strong>{comment.authorName}</strong>
                  <span>{relativeTime(comment.createdAt)}</span>
                  {comment.authorId === self.id && (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => deleteComment(doc, task.id, comment.id)}
                      aria-label="Delete comment"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p>{comment.body}</p>
              </li>
            ))}
            {comments.length === 0 && <li className="detail__hint">No comments yet.</li>}
          </ul>
          <textarea
            className="comments__input"
            value={newComment}
            rows={2}
            placeholder="Leave a comment"
            aria-label="Leave a comment"
            onChange={(event) => setNewComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              addComment(doc, task.id, newComment, self)
              setNewComment('')
            }}
          />
        </section>
      </div>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fields__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function dedupe(people: Person[]): Person[] {
  const seen = new Map<string, Person>()
  for (const person of people) {
    if (person?.id) seen.set(person.id, person)
  }
  return [...seen.values()]
}
