import { useMemo } from 'react'
import type * as Y from 'yjs'
import { noteFragment } from '../collab/note'
import type { DocHandle } from '../collab/docs'
import { updateItem } from '../collab/workspace'
import type { Person, WorkspaceItem } from '../lib/types'
import { RichTextEditor } from './RichTextEditor'
import { DocHeader } from './DocHeader'

interface Props {
  item: WorkspaceItem
  handle: DocHandle
  workspaceDoc: Y.Doc
  self: Person
}

export function NoteView({ item, handle, workspaceDoc, self }: Props) {
  const fragment = useMemo(() => noteFragment(handle.doc), [handle])

  return (
    <div className="doc">
      <DocHeader
        item={item}
        handle={handle}
        self={self}
        onRename={(title) => updateItem(workspaceDoc, item.id, { title })}
      />
      <div className="doc__body doc__body--note">
        <RichTextEditor fragment={fragment} handle={handle} placeholder="Write a note" autoFocus />
      </div>
    </div>
  )
}
