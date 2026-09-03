import { useEffect, useMemo } from 'react'
import { roomFor, WORKSPACE_ROOM } from './collab/docs'
import { useDoc, useYValue } from './collab/hooks'
import { usePresence } from './collab/presence'
import { seedTable } from './collab/table'
import { getItem, itemsMap, TYPE_LABELS } from './collab/workspace'
import { AuthScreens } from './components/AuthScreens'
import { DefunctOrigin, useOriginStatus } from './components/DefunctOrigin'
import { NoteView } from './components/NoteView'
import { Sidebar } from './components/Sidebar'
import { TableView } from './components/TableView'
import { TaskListView } from './components/TaskListView'
import { EmptyState } from './components/ui'
import { useSession } from './lib/auth-client'
import { useRoute } from './lib/router'
import type { Person, WorkspaceItem } from './lib/types'

export function App() {
  const origin = useOriginStatus()
  const { data: session, isPending } = useSession()

  // A cached copy whose origin no longer serves the app says so instead of
  // pretending. `pending` and `offline` change nothing: offline-first is a
  // feature, and the probe never delays the boot.
  if (origin === 'defunct') return <DefunctOrigin origin={window.location.origin} />

  if (isPending) {
    return (
      <div className="boot">
        <span className="boot__spinner" aria-hidden="true" />
        <p>Opening your team space…</p>
      </div>
    )
  }

  if (!session?.user) return <AuthScreens />

  const self: Person = {
    id: session.user.id,
    name: session.user.name || session.user.email,
    email: session.user.email,
    image: session.user.image ?? null,
  }

  return <Workspace self={self} />
}

function Workspace({ self }: { self: Person }) {
  const [route, navigate] = useRoute()
  const workspace = useDoc(WORKSPACE_ROOM)
  const workspaceDoc = workspace?.doc ?? null

  const item = useYValue(
    workspaceDoc ? itemsMap(workspaceDoc) : null,
    () => (workspaceDoc && route.id ? getItem(workspaceDoc, route.id) : null),
    [workspaceDoc, route.id],
  )

  const presence = usePresence(workspace, self)

  // The item's own document, opened only while it is on screen.
  const room = item ? roomFor(item.type, item.id) : null
  const handle = useDoc(room)

  useEffect(() => {
    if (item?.type === 'table' && handle) {
      // Only seed once the server's state has arrived. Seeding on the local
      // cache alone would give a second person opening the table a duplicate
      // set of columns, because their cache starts empty.
      void handle.whenSynced.then(() => {
        if (handle.doc.isDestroyed) return
        seedTable(handle.doc)
      })
    }
  }, [item?.type, handle])

  const open = (next: WorkspaceItem) => navigate({ type: next.type, id: next.id })

  if (!workspaceDoc) {
    return (
      <div className="boot">
        <span className="boot__spinner" aria-hidden="true" />
        <p>Loading the space…</p>
      </div>
    )
  }

  return (
    <div className="shell">
      <Sidebar
        workspaceDoc={workspaceDoc}
        self={self}
        activeId={item?.id ?? null}
        onOpen={open}
        presence={presence}
      />

      <main className="shell__main">
        {!item ? (
          <Overview />
        ) : !handle ? (
          <div className="boot">
            <span className="boot__spinner" aria-hidden="true" />
            <p>Opening {TYPE_LABELS[item.type].toLowerCase()}…</p>
          </div>
        ) : item.type === 'note' ? (
          <NoteView item={item} handle={handle} workspaceDoc={workspaceDoc} self={self} />
        ) : item.type === 'tasks' ? (
          <TaskListView
            item={item}
            handle={handle}
            workspaceDoc={workspaceDoc}
            self={self}
            openTaskId={route.taskId}
            onOpenTask={(taskId) => navigate({ type: item.type, id: item.id, taskId: taskId ?? null })}
          />
        ) : (
          <TableView item={item} handle={handle} workspaceDoc={workspaceDoc} self={self} />
        )}
      </main>
    </div>
  )
}

function Overview() {
  const tips = useMemo(
    () => [
      ['📝 Notes', 'Rich text that several people can edit at once, with everyone’s cursor visible.'],
      ['✅ Task lists', 'Drag to reorder, or Alt+↑ / Alt+↓. Open a task for description, checklist and comments.'],
      ['🌳 Tables', 'Group rows by any column to turn the table into a searchable tree.'],
    ],
    [],
  )

  return (
    <div className="overview">
      <EmptyState
        title="Pick something from the sidebar"
        hint="Or create a note, task list or table to get started."
      />
      <ul className="overview__tips">
        {tips.map(([title, body]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
