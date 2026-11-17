import { peerCellsAtRevision } from './peer-selection'

it('shows only selections based on the displayed canonical revision', () => {
  const cells = { sheetId: 'sheet', startRow: 1, endRow: 1, startColumn: 0, endColumn: 0, baseRevision: 2 }
  const peer = { clientId: 'client', presenceId: 'user', actorType: 'user' as const, displayName: 'User', color: '#123456',
    updatedAt: Date.now(), selection: { kind: 'cells' as const, cells } }
  expect(peerCellsAtRevision(peer, 2)).toEqual(cells)
  for (const revision of [1, 3, 0, NaN]) expect(peerCellsAtRevision(peer, revision)).toBeNull()
  expect(peerCellsAtRevision({ ...peer, selection: { kind: 'cells', cells: { ...cells, baseRevision: undefined } } }, 2)).toBeNull()
})
