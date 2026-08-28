import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands'
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'
import { Schema, type MarkType, type NodeType } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes, liftListItem, splitListItem, wrapInList } from 'prosemirror-schema-list'
import type { Command } from 'prosemirror-state'
import { redo, undo, yUndoPluginKey } from 'y-prosemirror'

/**
 * Rich-text schema: the basic nodes plus lists and a strikethrough mark.
 *
 * The same schema serves notes and task descriptions so both feel identical and
 * one editor component covers both.
 */
export const schema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks.addToEnd('strike', {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM: () => ['s', 0],
  }),
})

const marks = {
  strong: schema.marks.strong as MarkType,
  em: schema.marks.em as MarkType,
  code: schema.marks.code as MarkType,
  strike: schema.marks.strike as MarkType,
  link: schema.marks.link as MarkType,
}

const nodes = {
  paragraph: schema.nodes.paragraph as NodeType,
  heading: schema.nodes.heading as NodeType,
  bulletList: schema.nodes.bullet_list as NodeType,
  orderedList: schema.nodes.ordered_list as NodeType,
  listItem: schema.nodes.list_item as NodeType,
  blockquote: schema.nodes.blockquote as NodeType,
  codeBlock: schema.nodes.code_block as NodeType,
  rule: schema.nodes.horizontal_rule as NodeType,
}

export { marks, nodes }

/**
 * Markdown-style shortcuts. Typing `# ` or `- ` does what people expect from
 * every other editor, without the document ever showing markup.
 */
export function markdownInputRules() {
  return inputRules({
    rules: [
      wrappingInputRule(/^\s*([-+*])\s$/, nodes.bulletList),
      wrappingInputRule(/^(\d+)\.\s$/, nodes.orderedList),
      wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
      textblockTypeInputRule(/^```$/, nodes.codeBlock),
      textblockTypeInputRule(/^(#{1,3})\s$/, nodes.heading, (match) => ({
        level: match[1]!.length,
      })),
    ],
  })
}

export function editorKeymap() {
  return keymap({
    'Mod-b': toggleMark(marks.strong),
    'Mod-i': toggleMark(marks.em),
    'Mod-Shift-x': toggleMark(marks.strike),
    'Mod-e': toggleMark(marks.code),
    'Mod-Alt-0': setBlockType(nodes.paragraph),
    'Mod-Alt-1': setBlockType(nodes.heading, { level: 1 }),
    'Mod-Alt-2': setBlockType(nodes.heading, { level: 2 }),
    'Mod-Alt-3': setBlockType(nodes.heading, { level: 3 }),
    'Shift-Mod-8': wrapInList(nodes.bulletList),
    'Shift-Mod-9': wrapInList(nodes.orderedList),
    Enter: chainCommands(splitListItem(nodes.listItem), baseKeymap.Enter!),
    'Shift-Tab': liftListItem(nodes.listItem),
    // Undo is per-user: it reverts your own edits, never a teammate's.
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
  })
}

export { yUndoPluginKey }

export const toggle = {
  strong: toggleMark(marks.strong),
  em: toggleMark(marks.em),
  code: toggleMark(marks.code),
  strike: toggleMark(marks.strike),
} satisfies Record<string, Command>
