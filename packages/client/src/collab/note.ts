import * as Y from 'yjs'

/**
 * Note document: a single Y.XmlFragment, which is what `y-prosemirror` binds a
 * rich-text editor to. Keeping the key stable ("content") means an existing note
 * keeps working if the editor's schema gains nodes later.
 */
export function noteFragment(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment('content')
}

/** Plain text of a note, for previews and search. */
export function noteText(doc: Y.Doc, limit = 200): string {
  const text = fragmentText(noteFragment(doc)).replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function fragmentText(node: Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) return node.toString()
  if (node instanceof Y.XmlHook) return ''

  const parts: string[] = []
  for (const child of node.toArray()) {
    parts.push(fragmentText(child as Y.XmlElement | Y.XmlText | Y.XmlHook))
  }
  // Block boundaries should read as separate sentences in a one-line preview.
  return parts.join(node instanceof Y.XmlFragment ? ' ' : '')
}
