import { useMemo, useState } from 'react'
import type * as Y from 'yjs'
import { forgetDoc, roomFor } from '../collab/docs'
import { useYValue } from '../collab/hooks'
import {
  createItem,
  deleteItem,
  itemsMap,
  listItems,
  moveItem,
  TYPE_LABELS,
  updateItem,
} from '../collab/workspace'
import { signOutEverywhere, signOut } from '../lib/auth-client'
import { relativeTime } from '../lib/format'
import { matchesText, parseQuery } from '../lib/query'
import type { ItemType, Person, WorkspaceItem } from '../lib/types'
import { Avatar, Menu } from './ui'

const ORDER: ItemType[] = ['note', 'tasks', 'table']

export function Sidebar({
  workspaceDoc,
  self,
  activeId,
  onOpen,
  presence,
}: {
  workspaceDoc: Y.Doc
  self: Person
  activeId: string | null
  onOpen: (item: WorkspaceItem) => void
  presence: (Person & { color: string })[]
}) {
  const items = useYValue(itemsMap(workspaceDoc), () => listItems(workspaceDoc), [workspaceDoc])
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [collapsedTypes, setCollapsedTypes] = useState<Set<ItemType>>(new Set())

  const grouped = useMemo(() => {
    const query = parseQuery(search)
    const visible = items.filter((item) => matchesText(query, `${item.title} ${TYPE_LABELS[item.type]}`))
    return ORDER.map((type) => ({ type, items: visible.filter((item) => item.type === type) }))
  }, [items, search])

  const create = (type: ItemType) => {
    const item = createItem(workspaceDoc, type, defaultTitle(type), self.id)
    onOpen(item)
  }

  const remove = async (item: WorkspaceItem) => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return
    const room = roomFor(item.type, item.id)
    deleteItem(workspaceDoc, item.id)
    // Drop the document itself, both on the server and in this browser's cache,
    // so a deleted item cannot reappear from an offline copy.
    await fetch(`/api/rooms/${encodeURIComponent(room)}`, { method: 'DELETE' }).catch(() => {})
    await forgetDoc(room).catch(() => {})
  }

  return (
    <nav className="sidebar" aria-label="Team space">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          ⬡
        </span>
        <span>Mind Meld</span>
      </div>

      <input
        className="search search--sidebar"
        type="search"
        value={search}
        placeholder="Search the space"
        aria-label="Search the space"
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="sidebar__new">
        {ORDER.map((type) => (
          <button key={type} type="button" className="button" onClick={() => create(type)}>
            + {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="sidebar__list">
        {grouped.map(({ type, items: group }) => (
          <section key={type}>
            <button
              type="button"
              className="sidebar__group"
              aria-expanded={!collapsedTypes.has(type)}
              onClick={() =>
                setCollapsedTypes((current) => {
                  const next = new Set(current)
                  if (next.has(type)) next.delete(type)
                  else next.add(type)
                  return next
                })
              }
            >
              <span aria-hidden="true">{collapsedTypes.has(type) ? '▸' : '▾'}</span>
              {TYPE_LABELS[type]}
              <span className="sidebar__group-count">{group.length}</span>
            </button>

            {!collapsedTypes.has(type) &&
              group.map((item) => (
                <div
                  key={item.id}
                  className={`sidebar__item ${item.id === activeId ? 'is-active' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', item.id)
                    setDragging(item.id)
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!dragging || dragging === item.id) return
                    const target = items.findIndex((candidate) => candidate.id === item.id)
                    moveItem(workspaceDoc, dragging, target)
                    setDragging(null)
                  }}
                >
                  <button type="button" className="sidebar__open" onClick={() => onOpen(item)}>
                    <span aria-hidden="true">{item.icon}</span>
                    <span className="sidebar__item-title">{item.title || 'Untitled'}</span>
                  </button>
                  <Menu label="⋯" title={`${item.title} actions`} align="right">
                    {(close) => (
                      <>
                        <div className="menu__hint">Updated {relativeTime(item.updatedAt) || 'just now'}</div>
                        <button
                          type="button"
                          onClick={() => {
                            const title = window.prompt('Rename', item.title)
                            if (title !== null) updateItem(workspaceDoc, item.id, { title })
                            close()
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const icon = window.prompt('Icon (an emoji)', item.icon)
                            if (icon !== null && icon.trim()) {
                              updateItem(workspaceDoc, item.id, { icon: icon.trim() })
                            }
                            close()
                          }}
                        >
                          Change icon
                        </button>
                        <button type="button" className="is-danger" onClick={() => { void remove(item); close() }}>
                          Delete
                        </button>
                      </>
                    )}
                  </Menu>
                </div>
              ))}

            {group.length === 0 && <p className="sidebar__empty">None yet</p>}
          </section>
        ))}
      </div>

      <footer className="sidebar__footer">
        {presence.length > 0 && (
          <div className="sidebar__presence" title={presence.map((person) => person.name).join(', ')}>
            {presence.slice(0, 6).map((person) => (
              <Avatar key={person.id} person={person} size={22} />
            ))}
            <span className="sidebar__presence-label">
              {presence.length === 1 ? '1 other here' : `${presence.length} others here`}
            </span>
          </div>
        )}

        <Menu
          label={
            <>
              <Avatar person={self} size={24} />
              <span className="sidebar__me">{self.name}</span>
            </>
          }
          title="Account"
          className="sidebar__account"
        >
          {(close) => (
            <>
              <div className="menu__hint">{self.email}</div>
              <button type="button" onClick={() => { void signOut(); close() }}>
                Sign out
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Sign out on every device?')) void signOutEverywhere()
                  close()
                }}
              >
                Sign out everywhere
              </button>
            </>
          )}
        </Menu>
      </footer>
    </nav>
  )
}

function defaultTitle(type: ItemType): string {
  if (type === 'note') return 'New note'
  return type === 'tasks' ? 'New task list' : 'New table'
}
