import { useEffect, useRef, useState, type ReactNode } from 'react'
import { colorFor } from '../collab/presence'
import { initials } from '../lib/format'
import type { Person } from '../lib/types'

/** Shared presentational pieces, kept small and unopinionated. */

export function Avatar({ person, size = 26, title }: { person: Person; size?: number; title?: string }) {
  const [failed, setFailed] = useState(false)
  const label = title ?? `${person.name} (${person.email})`
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }

  if (person.image && !failed) {
    return (
      <img
        className="avatar"
        style={style}
        src={person.image}
        alt=""
        title={label}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className="avatar avatar--initials"
      style={{ ...style, background: colorFor(person.id) }}
      title={label}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  )
}

export function Chip({
  children,
  tone = 'neutral',
  onRemove,
  onClick,
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok'
  onRemove?: () => void
  onClick?: () => void
  title?: string
}) {
  const className = `chip chip--${tone}${onClick ? ' chip--button' : ''}`
  const content = (
    <>
      {children}
      {onRemove && (
        <button
          type="button"
          className="chip__remove"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </>
  )

  return onClick ? (
    <button type="button" className={className} onClick={onClick} title={title}>
      {content}
    </button>
  ) : (
    <span className={className} title={title}>
      {content}
    </span>
  )
}

/** A button that opens a small popover, closing on outside click or Escape. */
export function Menu({
  label,
  children,
  title,
  className = '',
  align = 'left',
}: {
  label: ReactNode
  children: (close: () => void) => ReactNode
  title?: string
  className?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="menu" ref={container}>
      <button
        type="button"
        className={`menu__trigger ${className}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
      >
        {label}
      </button>
      {open && (
        <div className={`menu__popover menu__popover--${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Text that becomes an input when clicked. Used for titles and cells. */
export function InlineText({
  value,
  onChange,
  placeholder,
  className = '',
  multiline = false,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
  ariaLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`inline-text ${className} ${value ? '' : 'inline-text--empty'}`}
        onClick={() => setEditing(true)}
        aria-label={ariaLabel}
      >
        {value || placeholder || '—'}
      </button>
    )
  }

  const shared = {
    autoFocus: true,
    className: `inline-text__input ${className}`,
    value: draft,
    placeholder,
    'aria-label': ariaLabel,
    onBlur: commit,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
  }

  return multiline ? (
    <textarea
      {...shared}
      rows={3}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  ) : (
    <input
      {...shared}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action}
    </div>
  )
}
