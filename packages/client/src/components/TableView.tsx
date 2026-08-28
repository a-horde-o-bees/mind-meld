import { useMemo, useState } from 'react'
import type * as Y from 'yjs'
import type { DocHandle } from '../collab/docs'
import { makeId } from '../collab/docs'
import { useDebounced, useYValue } from '../collab/hooks'
import {
  addColumn,
  addOption,
  addRow,
  appendRows,
  collapsedPaths,
  columnsArray,
  deleteColumn,
  deleteRow,
  groupBy,
  listColumns,
  listRows,
  moveColumn,
  replaceContents,
  rowsMap,
  setCell,
  setCollapsed,
  setGroupBy,
  toggleCollapsed,
  updateColumn,
  viewMap,
} from '../collab/table'
import { updateItem } from '../collab/workspace'
import { exportCsv, importCsv } from '../lib/csv'
import { matchesQuery, parseQuery } from '../lib/query'
import { allGroupPaths, buildTree, countRows, flattenTree, type GroupNode, type TreeNode } from '../lib/tree'
import type { CellValue, Column, ColumnType, Person, Row, WorkspaceItem } from '../lib/types'
import { DocHeader } from './DocHeader'
import { EmptyState, Menu } from './ui'

const COLUMN_TYPES: ColumnType[] = ['text', 'number', 'date', 'select', 'bool']

interface Props {
  item: WorkspaceItem
  handle: DocHandle
  workspaceDoc: Y.Doc
  self: Person
}

export function TableView({ item, handle, workspaceDoc, self }: Props) {
  const doc = handle.doc
  const columns = useYValue(columnsArray(doc), () => listColumns(doc), [doc])
  const rows = useYValue(rowsMap(doc), () => listRows(doc), [doc])
  const view = useYValue(
    viewMap(doc),
    () => ({ groupBy: groupBy(doc), collapsed: collapsedPaths(doc) }),
    [doc],
  )

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [importing, setImporting] = useState(false)

  const query = useMemo(() => parseQuery(debouncedSearch, columns), [debouncedSearch, columns])
  const matching = useMemo(
    () => rows.filter((row) => matchesQuery(query, row.cells, columns)),
    [rows, query, columns],
  )
  const tree = useMemo(() => buildTree(matching, columns, view.groupBy), [matching, columns, view.groupBy])
  const collapsed = useMemo(() => new Set(view.collapsed), [view.collapsed])
  const flat = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed])

  return (
    <div className="doc">
      <DocHeader
        item={item}
        handle={handle}
        self={self}
        onRename={(title) => updateItem(workspaceDoc, item.id, { title })}
      >
        <span className="doc__count">
          {countRows(tree)}
          {matching.length !== rows.length ? ` of ${rows.length}` : ''} rows
        </span>
      </DocHeader>

      <div className="table__controls">
        <input
          className="search"
          type="search"
          value={search}
          placeholder="Search — try owner:ana or cost:>100"
          aria-label="Search rows"
          onChange={(event) => setSearch(event.target.value)}
        />

        <GroupByControl
          columns={columns}
          groupBy={view.groupBy}
          onChange={(next) => setGroupBy(doc, next)}
        />

        {view.groupBy.length > 0 && (
          <>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setCollapsed(doc, allGroupPaths(tree))}
            >
              Collapse all
            </button>
            <button type="button" className="button button--ghost" onClick={() => setCollapsed(doc, [])}>
              Expand all
            </button>
          </>
        )}

        <div className="table__controls-right">
          <button type="button" className="button" onClick={() => setImporting(true)}>
            Import CSV
          </button>
          <button
            type="button"
            className="button"
            onClick={() => downloadCsv(`${item.title || 'table'}.csv`, exportCsv(columns, rows))}
          >
            Export CSV
          </button>
          <button type="button" className="button button--primary" onClick={() => addRow(doc)}>
            + Row
          </button>
        </div>
      </div>

      <div className="doc__body doc__body--table">
        {columns.length === 0 ? (
          <EmptyState
            title="No columns yet"
            hint="Add a column, or import a CSV to get started."
            action={
              <button type="button" className="button button--primary" onClick={() => addColumn(doc, 'Name')}>
                Add column
              </button>
            }
          />
        ) : (
          <div className="table__scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__tree-head">
                    {view.groupBy.length > 0 ? 'Group' : '#'}
                  </th>
                  {columns.map((column, index) => (
                    <ColumnHeader
                      key={column.id}
                      column={column}
                      index={index}
                      total={columns.length}
                      isGrouped={view.groupBy.includes(column.id)}
                      onRename={(name) => updateColumn(doc, column.id, { name })}
                      onRetype={(type) => updateColumn(doc, column.id, { type })}
                      onDelete={() => deleteColumn(doc, column.id)}
                      onMove={(target) => moveColumn(doc, column.id, target)}
                      onToggleGroup={() =>
                        setGroupBy(
                          doc,
                          view.groupBy.includes(column.id)
                            ? view.groupBy.filter((id) => id !== column.id)
                            : [...view.groupBy, column.id],
                        )
                      }
                    />
                  ))}
                  <th className="table__add-column">
                    <button
                      type="button"
                      onClick={() => addColumn(doc, `Column ${columns.length + 1}`)}
                      aria-label="Add column"
                      title="Add column"
                    >
                      +
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {flat.map((node) =>
                  node.kind === 'group' ? (
                    <GroupRow
                      key={`g:${node.path}`}
                      node={node}
                      columns={columns}
                      collapsed={collapsed.has(node.path)}
                      onToggle={() => toggleCollapsed(doc, node.path)}
                    />
                  ) : (
                    <DataRow
                      key={node.row.id}
                      row={node.row}
                      depth={node.depth}
                      columns={columns}
                      onEdit={(columnId, value) => setCell(doc, node.row.id, columnId, value)}
                      onAddOption={(columnId, option) => addOption(doc, columnId, option)}
                      onDelete={() => deleteRow(doc, node.row.id)}
                    />
                  ),
                )}
                {flat.length === 0 && (
                  <tr>
                    <td className="table__empty" colSpan={columns.length + 2}>
                      {rows.length === 0 ? 'No rows yet.' : 'No rows match that search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importing && (
        <ImportDialog
          onCancel={() => setImporting(false)}
          onImport={(text, mode) => {
            const imported = importCsv(text, makeId)
            if (imported.columns.length === 0) return
            if (mode === 'replace') replaceContents(doc, imported.columns, imported.rows)
            else appendRows(doc, imported.columns, imported.rows)
            setImporting(false)
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------- header --- */

function ColumnHeader({
  column,
  index,
  total,
  isGrouped,
  onRename,
  onRetype,
  onDelete,
  onMove,
  onToggleGroup,
}: {
  column: Column
  index: number
  total: number
  isGrouped: boolean
  onRename: (name: string) => void
  onRetype: (type: ColumnType) => void
  onDelete: () => void
  onMove: (index: number) => void
  onToggleGroup: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.name)

  return (
    <th className={isGrouped ? 'is-grouped' : ''}>
      <div className="table__header-cell">
        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label="Column name"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false)
              if (draft.trim() && draft !== column.name) onRename(draft.trim())
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setDraft(column.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button type="button" className="table__header-name" onClick={() => setEditing(true)}>
            {isGrouped && <span title="Grouped by this column">🌳 </span>}
            {column.name}
          </button>
        )}

        <Menu label="▾" title={`${column.name} options`} align="right">
          {(close) => (
            <>
              <button type="button" onClick={() => { onToggleGroup(); close() }}>
                {isGrouped ? 'Stop grouping by this' : 'Group by this column'}
              </button>
              <div className="menu__label">Type</div>
              {COLUMN_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={type === column.type ? 'is-active' : ''}
                  onClick={() => { onRetype(type); close() }}
                >
                  {type}
                </button>
              ))}
              <div className="menu__label">Position</div>
              <button type="button" disabled={index === 0} onClick={() => { onMove(index - 1); close() }}>
                Move left
              </button>
              <button
                type="button"
                disabled={index === total - 1}
                onClick={() => { onMove(index + 1); close() }}
              >
                Move right
              </button>
              <button type="button" className="is-danger" onClick={() => { onDelete(); close() }}>
                Delete column
              </button>
            </>
          )}
        </Menu>
      </div>
    </th>
  )
}

function GroupByControl({
  columns,
  groupBy: current,
  onChange,
}: {
  columns: Column[]
  groupBy: string[]
  onChange: (next: string[]) => void
}) {
  const names = current
    .map((id) => columns.find((column) => column.id === id)?.name)
    .filter(Boolean)
    .join(' → ')

  return (
    <Menu label={<>🌳 {names || 'Group by'}</>} title="Group rows into a tree">
      {() => (
        <>
          <div className="menu__label">Levels, outermost first</div>
          {current.map((id, index) => {
            const column = columns.find((candidate) => candidate.id === id)
            if (!column) return null
            return (
              <div key={id} className="menu__row">
                <span>
                  {index + 1}. {column.name}
                </span>
                <span className="menu__row-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move ${column.name} up`}
                    onClick={() => onChange(swap(current, index, index - 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === current.length - 1}
                    aria-label={`Move ${column.name} down`}
                    onClick={() => onChange(swap(current, index, index + 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Stop grouping by ${column.name}`}
                    onClick={() => onChange(current.filter((candidate) => candidate !== id))}
                  >
                    ×
                  </button>
                </span>
              </div>
            )
          })}
          {current.length === 0 && <div className="menu__hint">Rows are shown as a flat list.</div>}

          <div className="menu__label">Add a level</div>
          {columns
            .filter((column) => !current.includes(column.id))
            .map((column) => (
              <button key={column.id} type="button" onClick={() => onChange([...current, column.id])}>
                {column.name}
              </button>
            ))}
        </>
      )}
    </Menu>
  )
}

function swap(list: string[], a: number, b: number): string[] {
  const copy = [...list]
  const first = copy[a]!
  copy[a] = copy[b]!
  copy[b] = first
  return copy
}

/* ---------------------------------------------------------------- rows --- */

function GroupRow({
  node,
  columns,
  collapsed,
  onToggle,
}: {
  node: GroupNode
  columns: Column[]
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <tr className={`table__group table__group--depth-${Math.min(node.depth, 3)}`}>
      <th scope="row" style={{ paddingLeft: 8 + node.depth * 18 }}>
        <button type="button" className="table__disclosure" onClick={onToggle} aria-expanded={!collapsed}>
          <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          <span className={node.value === '' ? 'table__group-empty' : ''}>{node.label}</span>
          <span className="table__group-count">{node.count}</span>
        </button>
      </th>
      {columns.map((column) => (
        <td key={column.id} className="table__group-sum">
          {node.sums[column.id] !== undefined ? formatNumber(node.sums[column.id]!) : ''}
        </td>
      ))}
      <td />
    </tr>
  )
}

function DataRow({
  row,
  depth,
  columns,
  onEdit,
  onAddOption,
  onDelete,
}: {
  row: Row
  depth: number
  columns: Column[]
  onEdit: (columnId: string, value: CellValue) => void
  onAddOption: (columnId: string, option: string) => void
  onDelete: () => void
}) {
  return (
    <tr className="table__row">
      <td className="table__row-handle" style={{ paddingLeft: 8 + depth * 18 }}>
        <Menu label="⋯" title="Row actions" align="left">
          {(close) => (
            <button type="button" className="is-danger" onClick={() => { onDelete(); close() }}>
              Delete row
            </button>
          )}
        </Menu>
      </td>
      {columns.map((column) => (
        <td key={column.id}>
          <Cell
            column={column}
            value={row.cells[column.id] ?? null}
            onChange={(value) => onEdit(column.id, value)}
            onAddOption={(option) => onAddOption(column.id, option)}
          />
        </td>
      ))}
      <td />
    </tr>
  )
}

function Cell({
  column,
  value,
  onChange,
  onAddOption,
}: {
  column: Column
  value: CellValue
  onChange: (value: CellValue) => void
  onAddOption: (option: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = value === null || value === undefined ? '' : String(value)

  if (column.type === 'bool') {
    return (
      <input
        type="checkbox"
        checked={value === true}
        aria-label={column.name}
        onChange={(event) => onChange(event.target.checked)}
      />
    )
  }

  if (column.type === 'select') {
    const options = column.options ?? []
    return (
      <select
        value={text}
        aria-label={column.name}
        onChange={(event) => {
          if (event.target.value === '__new') {
            const option = window.prompt(`New value for ${column.name}`)
            if (option?.trim()) {
              onAddOption(option.trim())
              onChange(option.trim())
            }
            return
          }
          onChange(event.target.value || null)
        }}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {text !== '' && !options.includes(text) && <option value={text}>{text}</option>}
        <option value="__new">＋ New value…</option>
      </select>
    )
  }

  return (
    <input
      type={column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}
      className="table__input"
      aria-label={column.name}
      value={draft ?? text}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft === null) return
        onChange(parseInput(draft, column.type))
        setDraft(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function parseInput(raw: string, type: ColumnType): CellValue {
  const value = raw.trim()
  if (value === '') return null
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return raw
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

/* -------------------------------------------------------------- import --- */

function ImportDialog({
  onCancel,
  onImport,
}: {
  onCancel: () => void
  onImport: (text: string, mode: 'replace' | 'append') => void
}) {
  const [text, setText] = useState('')

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Import CSV">
      <div className="modal__panel">
        <h2>Import CSV</h2>
        <p className="detail__hint">
          Paste rows including a header line. Column types are guessed from the values.
        </p>
        <textarea
          autoFocus
          rows={10}
          value={text}
          aria-label="CSV content"
          placeholder={'Name,Region,Cost\nRoof survey,North,120'}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="modal__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button" disabled={!text.trim()} onClick={() => onImport(text, 'append')}>
            Add rows
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!text.trim()}
            onClick={() => onImport(text, 'replace')}
          >
            Replace table
          </button>
        </div>
      </div>
    </div>
  )
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export type { TreeNode }
