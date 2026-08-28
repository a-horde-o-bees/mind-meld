import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { baseKeymap, lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { keymap } from 'prosemirror-keymap'
import type { MarkType, NodeType } from 'prosemirror-model'
import { EditorState, type Command, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { liftListItem, wrapInList } from 'prosemirror-schema-list'
import { useEffect, useRef, useState } from 'react'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror'
import type * as Y from 'yjs'
import type { DocHandle } from '../collab/docs'
import { editorKeymap, markdownInputRules, marks, nodes, schema } from './editor-schema'

/**
 * Collaborative rich-text editor.
 *
 * `ySyncPlugin` keeps the ProseMirror document and the Y.XmlFragment in step,
 * `yCursorPlugin` draws teammates' carets with their names, and `yUndoPlugin`
 * scopes undo to your own edits so Ctrl+Z never reverts someone else's
 * sentence. Used for both notes and task descriptions.
 */

interface Props {
  fragment: Y.XmlFragment
  handle: DocHandle
  placeholder?: string
  /** Compact chrome for the task detail panel. */
  compact?: boolean
  autoFocus?: boolean
}

export function RichTextEditor({ fragment, handle, placeholder, compact, autoFocus }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!mount.current) return

    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(fragment),
        yCursorPlugin(handle.provider.awareness),
        yUndoPlugin(),
        markdownInputRules(),
        editorKeymap(),
        keymap(baseKeymap),
        dropCursor(),
        gapCursor(),
      ],
    })

    // A remote update can arrive in the same tick the view is torn down —
    // React remounts effects in development, and switching documents does the
    // same in production. Dispatching into a destroyed view throws deep inside
    // ProseMirror, so every dispatch checks first.
    let destroyed = false

    const editorView = new EditorView(mount.current, {
      state,
      attributes: { class: 'prose', 'aria-label': placeholder ?? 'Editor' },
      // ProseMirror invokes this with the view as `this`. Referring to the
      // `editorView` binding instead would throw during construction, because
      // the constructor can dispatch before the const is initialised.
      dispatchTransaction(this: EditorView, transaction: Transaction) {
        if (destroyed) return
        this.updateState(this.state.apply(transaction))
        // Re-render the toolbar so its active states follow the selection.
        setVersion((value) => value + 1)
      },
    })
    setView(editorView)
    if (autoFocus) editorView.focus()

    return () => {
      destroyed = true
      editorView.destroy()
      setView(null)
    }
    // A different fragment means a different document: rebuild the view.
  }, [fragment, handle, placeholder, autoFocus])

  return (
    <div className={compact ? 'editor editor--compact' : 'editor'}>
      <Toolbar view={view} compact={compact} version={version} />
      <div className="editor__surface" ref={mount} />
    </div>
  )
}

interface ToolbarProps {
  view: EditorView | null
  compact?: boolean
  /** Bumped on every transaction; keeps the active states in step. */
  version: number
}

function Toolbar({ view, compact }: ToolbarProps) {
  const run = (command: Command) => () => {
    if (!view) return
    command(view.state, view.dispatch, view)
    view.focus()
  }

  const markActive = (type: MarkType): boolean => {
    if (!view) return false
    const { from, $from, to, empty } = view.state.selection
    return empty
      ? Boolean(type.isInSet(view.state.storedMarks ?? $from.marks()))
      : view.state.doc.rangeHasMark(from, to, type)
  }

  const blockActive = (type: NodeType, attrs?: Record<string, unknown>): boolean => {
    if (!view) return false
    const { $from, to, node } = view.state.selection as { $from: any; to: number; node?: any }
    if (node) return node.hasMarkup(type, attrs)
    return to <= $from.end() && $from.parent.hasMarkup(type, attrs)
  }

  return (
    <div className="editor__toolbar" role="toolbar" aria-label="Formatting">
      <button
        type="button"
        className={markActive(marks.strong) ? 'is-active' : ''}
        onClick={run(toggleMark(marks.strong))}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      >
        <b>B</b>
      </button>
      <button
        type="button"
        className={markActive(marks.em) ? 'is-active' : ''}
        onClick={run(toggleMark(marks.em))}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        className={markActive(marks.strike) ? 'is-active' : ''}
        onClick={run(toggleMark(marks.strike))}
        title="Strikethrough"
        aria-label="Strikethrough"
      >
        <s>S</s>
      </button>
      <button
        type="button"
        className={markActive(marks.code) ? 'is-active' : ''}
        onClick={run(toggleMark(marks.code))}
        title="Inline code"
        aria-label="Inline code"
      >
        {'</>'}
      </button>

      <span className="editor__divider" />

      {!compact &&
        ([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={blockActive(nodes.heading, { level }) ? 'is-active' : ''}
            onClick={run(setBlockType(nodes.heading, { level }))}
            title={`Heading ${level}`}
            aria-label={`Heading ${level}`}
          >
            H{level}
          </button>
        ))}

      <button
        type="button"
        onClick={run(wrapInList(nodes.bulletList))}
        title="Bulleted list"
        aria-label="Bulleted list"
      >
        •—
      </button>
      <button
        type="button"
        onClick={run(wrapInList(nodes.orderedList))}
        title="Numbered list"
        aria-label="Numbered list"
      >
        1.
      </button>
      <button
        type="button"
        onClick={run(liftListItem(nodes.listItem))}
        title="Outdent list item (Shift+Tab)"
        aria-label="Outdent list item"
      >
        ⇤
      </button>

      {!compact && (
        <>
          <span className="editor__divider" />
          <button
            type="button"
            className={blockActive(nodes.blockquote) ? 'is-active' : ''}
            onClick={run(wrapIn(nodes.blockquote))}
            title="Quote"
            aria-label="Quote"
          >
            ❝
          </button>
          <button
            type="button"
            className={blockActive(nodes.codeBlock) ? 'is-active' : ''}
            onClick={run(setBlockType(nodes.codeBlock))}
            title="Code block"
            aria-label="Code block"
          >
            {'{ }'}
          </button>
          <button
            type="button"
            onClick={run(insertRule)}
            title="Divider"
            aria-label="Divider"
          >
            —
          </button>
          <button type="button" onClick={run(lift)} title="Unwrap" aria-label="Unwrap">
            ⇱
          </button>
          <span className="editor__divider" />
          <button type="button" onClick={run(setLink)} title="Add link" aria-label="Add link">
            🔗
          </button>
        </>
      )}
    </div>
  )
}

const insertRule: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(nodes.rule.create()))
  return true
}

const setLink: Command = (state, dispatch, view) => {
  const { from, to, empty } = state.selection
  if (empty) return false
  const href = window.prompt('Link address')
  if (href === null) return false
  const command = href === '' ? toggleMark(marks.link) : toggleMark(marks.link, { href })
  return command(state, dispatch, view)
}
