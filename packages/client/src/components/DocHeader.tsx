import type { ReactNode } from 'react'
import type { DocHandle } from '../collab/docs'
import { useConnectionStatus } from '../collab/hooks'
import { usePresence } from '../collab/presence'
import { relativeTime } from '../lib/format'
import type { Person, WorkspaceItem } from '../lib/types'
import { Avatar, InlineText } from './ui'

/** Title, live connection state, who else is here, and per-view actions. */
export function DocHeader({
  item,
  handle,
  self,
  onRename,
  children,
}: {
  item: WorkspaceItem
  handle: DocHandle
  self: Person
  onRename: (title: string) => void
  children?: ReactNode
}) {
  const status = useConnectionStatus(handle)
  const others = usePresence(handle, self)

  return (
    <header className="doc__header">
      <div className="doc__title">
        <span className="doc__icon" aria-hidden="true">
          {item.icon}
        </span>
        <InlineText
          value={item.title}
          onChange={onRename}
          placeholder="Untitled"
          className="doc__title-text"
          ariaLabel="Document title"
        />
      </div>

      <div className="doc__meta">
        {children}
        <div className="presence" title={others.map((person) => person.name).join(', ')}>
          {others.slice(0, 5).map((person) => (
            <Avatar key={person.id} person={person} />
          ))}
          {others.length > 5 && <span className="presence__more">+{others.length - 5}</span>}
        </div>
        <span className={`status status--${status}`} title={statusTitle(status)}>
          <span className="status__dot" aria-hidden="true" />
          {statusLabel(status)}
        </span>
        {item.updatedAt > 0 && (
          <span className="doc__updated" title="Last change">
            {relativeTime(item.updatedAt)}
          </span>
        )}
      </div>
    </header>
  )
}

function statusLabel(status: string): string {
  if (status === 'connected') return 'Live'
  return status === 'connecting' ? 'Connecting' : 'Offline'
}

function statusTitle(status: string): string {
  if (status === 'connected') return 'Changes are syncing with the team'
  if (status === 'connecting') return 'Reconnecting…'
  return 'Working offline — changes are saved on this device and will sync when you reconnect'
}
