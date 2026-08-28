import { describe, expect, it } from 'vitest'
import { matchesQuery, parseQuery } from './query'
import { allGroupPaths, buildTree, countRows, EMPTY_LABEL, flattenTree, type GroupNode } from './tree'
import type { Column, Row } from './types'

const columns: Column[] = [
  { id: 'c_name', name: 'Name', type: 'text' },
  { id: 'c_region', name: 'Region', type: 'select', options: ['North', 'South'] },
  { id: 'c_owner', name: 'Owner', type: 'text' },
  { id: 'c_cost', name: 'Cost', type: 'number' },
]

const row = (id: string, name: string, region: string, owner: string, cost: number | null): Row => ({
  id,
  order: id,
  cells: { c_name: name, c_region: region, c_owner: owner, c_cost: cost },
})

const rows: Row[] = [
  row('r1', 'Roof survey', 'North', 'Ana', 120),
  row('r2', 'Boiler service', 'South', 'Ben', 80),
  row('r3', 'Gutter clean', 'North', 'Ana', 40),
  row('r4', 'Fence repair', 'North', 'Ben', null),
  row('r5', 'Drain check', '', 'Ana', 10),
]

const groups = (nodes: ReturnType<typeof buildTree>) => nodes.filter((n): n is GroupNode => n.kind === 'group')

describe('buildTree', () => {
  it('returns plain rows when nothing is grouped', () => {
    const tree = buildTree(rows, columns, [])
    expect(tree).toHaveLength(5)
    expect(tree.every((node) => node.kind === 'row')).toBe(true)
  })

  it('groups by one column', () => {
    const tree = groups(buildTree(rows, columns, ['c_region']))
    expect(tree.map((node) => node.label)).toEqual(['North', 'South', EMPTY_LABEL])
    expect(tree[0]!.count).toBe(3)
    expect(tree[0]!.children.every((child) => child.kind === 'row')).toBe(true)
  })

  it('nests one level per grouping column', () => {
    const tree = groups(buildTree(rows, columns, ['c_region', 'c_owner']))
    const north = tree[0]!
    const owners = north.children.filter((node): node is GroupNode => node.kind === 'group')
    expect(owners.map((node) => node.label)).toEqual(['Ana', 'Ben'])
    expect(owners[0]!.count).toBe(2)
    expect(owners[0]!.depth).toBe(1)
    expect(owners[0]!.children.map((node) => (node.kind === 'row' ? node.row.id : ''))).toEqual(['r1', 'r3'])
  })

  it('totals numeric columns per node, including nested ones', () => {
    const tree = groups(buildTree(rows, columns, ['c_region', 'c_owner']))
    expect(tree[0]!.sums.c_cost).toBe(160)
    const ana = tree[0]!.children.find((node): node is GroupNode => node.kind === 'group')!
    expect(ana.sums.c_cost).toBe(160)
  })

  it('omits a total when a group has no numeric values at all', () => {
    const onlyEmpty = buildTree([row('r9', 'x', 'North', 'Ana', null)], columns, ['c_region'])
    expect(groups(onlyEmpty)[0]!.sums.c_cost).toBeUndefined()
  })

  it('buckets missing values under (empty) and sorts them last', () => {
    const tree = groups(buildTree(rows, columns, ['c_region']))
    const last = tree.at(-1)!
    expect(last.value).toBe('')
    expect(last.label).toBe(EMPTY_LABEL)
  })

  it('respects a select column’s own option order', () => {
    const reordered: Column[] = columns.map((column) =>
      column.id === 'c_region' ? { ...column, options: ['South', 'North'] } : column,
    )
    const tree = groups(buildTree(rows, reordered, ['c_region']))
    expect(tree.map((node) => node.label)).toEqual(['South', 'North', EMPTY_LABEL])
  })

  it('ignores grouping columns that no longer exist', () => {
    const tree = buildTree(rows, columns, ['c_deleted'])
    expect(tree.every((node) => node.kind === 'row')).toBe(true)
  })

  it('gives every node a path unique to its position', () => {
    const tree = buildTree(rows, columns, ['c_region', 'c_owner'])
    const paths = allGroupPaths(tree)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('flattenTree', () => {
  it('hides the children of collapsed groups', () => {
    const tree = buildTree(rows, columns, ['c_region'])
    const northPath = groups(tree)[0]!.path
    expect(flattenTree(tree, new Set())).toHaveLength(8) // 3 groups + 5 rows
    expect(flattenTree(tree, new Set([northPath]))).toHaveLength(5) // 3 groups + 2 rows
  })
})

describe('search pruning', () => {
  const treeFor = (search: string) => {
    const query = parseQuery(search, columns)
    const matching = rows.filter((candidate) => matchesQuery(query, candidate.cells, columns))
    return buildTree(matching, columns, ['c_region', 'c_owner'])
  }

  it('keeps only the branches that still contain matching rows', () => {
    const tree = groups(treeFor('owner:ben'))
    expect(tree.map((node) => node.label)).toEqual(['North', 'South'])
    expect(countRows(tree)).toBe(2)
  })

  it('recomputes totals from the matching rows only', () => {
    const tree = groups(treeFor('owner:ana'))
    expect(tree[0]!.sums.c_cost).toBe(160)
    expect(countRows(tree)).toBe(3)
  })

  it('collapses to nothing when no row matches', () => {
    expect(treeFor('nothing-matches-this')).toEqual([])
  })
})
