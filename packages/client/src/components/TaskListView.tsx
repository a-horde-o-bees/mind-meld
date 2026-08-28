import { useMemo, useState } from 'react'
import type * as Y from 'yjs'
import type { DocHandle } from '../collab/docs'
import { useYValue } from '../collab/hooks'
import {
  createTask,
  deleteTask,
  listTasks,
  moveTask,
  nudgeTask,
  tasksMap,
  updateTask,
} from '../collab/tasks'
import { updateItem } from '../collab/workspace'
import { dueState, formatDate } from '../lib/format'
import { matchesText, parseQuery } from '../lib/query'
import type { Person, Task, WorkspaceItem } from '../lib/types'
import { DocHeader } from './DocHeader'
import { TaskDetail } from './TaskDetail'
import { STATUS_LABELS, STATUS_TONE } from './task-labels'
import { Avatar, Chip, EmptyState, Menu } from './ui'

interface Props {
  item: WorkspaceItem
  handle: DocHandle
  workspaceDoc: Y.Doc
  self: Person
  openTaskId: string | null
  onOpenTask: (taskId: string | null) => void
}

export function TaskListView({ item, handle, workspaceDoc, self, openTaskId, onOpenTask }: Props) {
  const doc = handle.doc
  const tasks = useYValue(tasksMap(doc), () => listTasks(doc), [doc])
  const [search, setSearch] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const visible = useMemo(() => {
    const query = parseQuery(search)
    return tasks.filter((task) => {
      if (hideDone && task.status === 'done') return false
      const haystack = [task.title, task.assignee?.name ?? '', task.tags.join(' '), task.status].join(' ')
      return matchesText(query, haystack)
    })
  }, [tasks, search, hideDone])

  const remaining = tasks.filter((task) => task.status !== 'done').length
  const openTask = openTaskId ? tasks.find((task) => task.id === openTaskId) ?? null : null

  const handleDrop = (index: number) => {
    if (!dragging) return
    // The drop index counts positions in the visible list; translate it to a
    // position in the full list so filtering never scrambles the real order.
    const target = visible[index] ?? null
    const fullIndex = target ? tasks.findIndex((task) => task.id === target.id) : tasks.length
    const draggedIndex = tasks.findIndex((task) => task.id === dragging)
    moveTask(doc, dragging, fullIndex > draggedIndex ? fullIndex - 1 : fullIndex)
    setDragging(null)
    setDropIndex(null)
  }

  return (
    <div className={openTask ? 'doc doc--with-detail' : 'doc'}>
      <DocHeader
        item={item}
        handle={handle}
        self={self}
        onRename={(title) => updateItem(workspaceDoc, item.id, { title })}
      >
        <span className="doc__count">
          {remaining} open · {tasks.length} total
        </span>
      </DocHeader>

      <div className="tasks__controls">
        <input
          className="search"
          type="search"
          value={search}
          placeholder="Filter tasks"
          aria-label="Filter tasks"
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="toggle">
          <input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} />
          Hide done
        </label>
        <button type="button" className="button button--primary" onClick={() => {
          const task = createTask(doc, '')
          onOpenTask(task.id)
        }}>
          + Task
        </button>
      </div>

      <div className="doc__body">
        {visible.length === 0 ? (
          <EmptyState
            title={tasks.length === 0 ? 'No tasks yet' : 'Nothing matches that filter'}
            hint={
              tasks.length === 0
                ? 'Add the first one. Drag to reorder, or use Alt+↑ and Alt+↓.'
                : undefined
            }
          />
        ) : (
          <ol className="tasks" onDragLeave={() => setDropIndex(null)}>
            {visible.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                index={index}
                isOpen={task.id === openTaskId}
                isDragging={dragging === task.id}
                showDropBefore={dropIndex === index}
                onOpen={() => onOpenTask(task.id)}
                onToggle={() =>
                  updateTask(doc, task.id, { status: task.status === 'done' ? 'todo' : 'done' })
                }
                onDelete={() => {
                  deleteTask(doc, task.id)
                  if (task.id === openTaskId) onOpenTask(null)
                }}
                onNudge={(delta) => nudgeTask(doc, visible, task.id, delta)}
                onDragStart={() => setDragging(task.id)}
                onDragEnd={() => {
                  setDragging(null)
                  setDropIndex(null)
                }}
                onDragOver={(position) => setDropIndex(position)}
                onDrop={handleDrop}
              />
            ))}
            <li
              className={`tasks__tail ${dropIndex === visible.length ? 'is-drop-target' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setDropIndex(visible.length)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDrop(visible.length)
              }}
            />
          </ol>
        )}
      </div>

      {openTask && (
        <TaskDetail
          task={openTask}
          handle={handle}
          self={self}
          onClose={() => onOpenTask(null)}
          onDelete={() => {
            deleteTask(doc, openTask.id)
            onOpenTask(null)
          }}
        />
      )}
    </div>
  )
}

interface RowProps {
  task: Task
  index: number
  isOpen: boolean
  isDragging: boolean
  showDropBefore: boolean
  onOpen: () => void
  onToggle: () => void
  onDelete: () => void
  onNudge: (delta: number) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (index: number) => void
  onDrop: (index: number) => void
}

function TaskRow({
  task,
  index,
  isOpen,
  isDragging,
  showDropBefore,
  onOpen,
  onToggle,
  onDelete,
  onNudge,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: RowProps) {
  const due = dueState(task.due)

  return (
    <li
      className={[
        'task',
        isDragging ? 'is-dragging' : '',
        isOpen ? 'is-open' : '',
        showDropBefore ? 'is-drop-target' : '',
        task.status === 'done' ? 'is-done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        // Firefox refuses to start a drag without data on the transfer.
        event.dataTransfer.setData('text/plain', task.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const after = event.clientY > bounds.top + bounds.height / 2
        onDragOver(after ? index + 1 : index)
      }}
      onDrop={(event) => {
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const after = event.clientY > bounds.top + bounds.height / 2
        onDrop(after ? index + 1 : index)
      }}
      onKeyDown={(event) => {
        // Keyboard reordering, so dragging is never the only way.
        if (event.altKey && event.key === 'ArrowUp') {
          event.preventDefault()
          onNudge(-1)
        }
        if (event.altKey && event.key === 'ArrowDown') {
          event.preventDefault()
          onNudge(1)
        }
      }}
      tabIndex={0}
    >
      <span className="task__grip" aria-hidden="true" title="Drag to reorder, or Alt+↑ / Alt+↓">
        ⠿
      </span>

      <input
        type="checkbox"
        className="task__check"
        checked={task.status === 'done'}
        onChange={onToggle}
        aria-label={`Mark ${task.title || 'untitled task'} ${task.status === 'done' ? 'not done' : 'done'}`}
      />

      <button type="button" className="task__title" onClick={onOpen}>
        {task.title || <span className="task__untitled">Untitled task</span>}
      </button>

      <div className="task__facts">
        {task.tags.map((tag) => (
          <Chip key={tag}>{tag}</Chip>
        ))}
        {task.due && (
          <Chip tone={due === 'overdue' ? 'danger' : due === 'today' || due === 'soon' ? 'warn' : 'neutral'}>
            {formatDate(task.due)}
          </Chip>
        )}
        {task.priority !== 'medium' && (
          <Chip tone={task.priority === 'urgent' || task.priority === 'high' ? 'warn' : 'neutral'}>
            {task.priority}
          </Chip>
        )}
        <Chip tone={STATUS_TONE[task.status]}>{STATUS_LABELS[task.status]}</Chip>
        {task.assignee ? (
          <Avatar person={task.assignee} size={22} />
        ) : (
          <span className="task__unassigned" title="Unassigned">
            —
          </span>
        )}
        <Menu label="⋯" title="Task actions" align="right" className="task__more">
          {(close) => (
            <>
              <button type="button" onClick={() => { onOpen(); close() }}>
                Open details
              </button>
              <button type="button" onClick={() => { onNudge(-1); close() }}>
                Move up
              </button>
              <button type="button" onClick={() => { onNudge(1); close() }}>
                Move down
              </button>
              <button type="button" className="is-danger" onClick={() => { onDelete(); close() }}>
                Delete task
              </button>
            </>
          )}
        </Menu>
      </div>
    </li>
  )
}
