/** Plain data shapes shared by the pure helpers and the Yjs accessors. */

export type ItemType = 'note' | 'tasks' | 'table'

export interface WorkspaceItem {
  id: string
  type: ItemType
  title: string
  icon: string
  order: string
  createdAt: number
  createdBy: string
  updatedAt: number
}

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'bool'

export interface Column {
  id: string
  name: string
  type: ColumnType
  /** Choices for `select` columns. */
  options?: string[]
  width?: number
}

export type CellValue = string | number | boolean | null

export interface Row {
  id: string
  order: string
  cells: Record<string, CellValue>
}

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

export interface Person {
  id: string
  name: string
  email: string
  image: string | null
}

export interface Subtask {
  id: string
  title: string
  done: boolean
  order: string
}

export interface Comment {
  id: string
  body: string
  authorId: string
  authorName: string
  createdAt: number
}

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  order: string
  assignee: Person | null
  due: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
}
