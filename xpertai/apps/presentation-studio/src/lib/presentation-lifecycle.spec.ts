import { PresentationDeck } from './entities/index.js'
import { isPresentationActive, presentationRevision, transitionPresentationLifecycle } from './presentation-lifecycle.js'

function fixture() {
  const deck = Object.assign(new PresentationDeck(), { id: 'deck', revision: 4, lifecycleRevision: 0, lifecycleState: 'active' })
  const repo = { findOneBy: jest.fn(async () => deck), findOneOrFail: jest.fn(async () => deck),
    save: jest.fn(async value => value), update: jest.fn(async (_where, values) => Object.assign(deck, values)),
    manager: { transaction: jest.fn() } }
  repo.manager.transaction.mockImplementation(work => work({ getRepository: () => repo }))
  const collaboration = { ensureDocument: jest.fn(), archiveDocument: jest.fn(), restoreDocument: jest.fn() }
  const revokeLinks = jest.fn()
  return { deck, repo, collaboration, revokeLinks,
    run: (deleted: boolean, expectedRevision: string) => transitionPresentationLifecycle({ decks: repo as never,
      where: { id: 'deck' }, collaboration: collaboration as never, deleted, expectedRevision, revokeLinks }) }
}
it('fences editing, retires collaboration and revokes shares before completing recycle', async () => {
  const f = fixture()
  f.collaboration.archiveDocument.mockImplementation(async () => {
    expect(isPresentationActive(f.deck)).toBe(false)
    expect(f.deck.lifecycleState).toBe('archiving')
  })
  await f.run(true, '4:0')
  expect(f.collaboration.archiveDocument).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'deck', expectedSequence: 4 }))
  expect(f.deck.lifecycleState).toBe('archived')
  expect(presentationRevision(f.deck)).toBe('4:1')
  await f.run(false, '4:1')
  expect(f.collaboration.restoreDocument).toHaveBeenCalledTimes(1)
  expect(presentationRevision(f.deck)).toBe('4:2')
  expect(isPresentationActive(f.deck)).toBe(true)
  expect(f.revokeLinks).toHaveBeenCalledTimes(1)
})
it('leaves an interrupted revoke fenced and allows retry without new identities or sequence reset', async () => {
  const f = fixture()
  f.revokeLinks.mockRejectedValueOnce(new Error('temporary outage'))
  await expect(f.run(true, '4:0')).rejects.toThrow('temporary outage')
  expect(f.deck.lifecycleState).toBe('archiving')
  await expect(f.run(false, '4:1')).rejects.toThrow('PRESENTATION_LIFECYCLE_PENDING')
  await f.run(true, '4:1')
  expect(f.deck.lifecycleState).toBe('archived')
  expect(f.collaboration.ensureDocument).toHaveBeenCalledTimes(1)
  expect(f.deck.revision).toBe(4)
})
it('rejects stale lifecycle revisions before archiving or revoking links', async () => {
  const f = fixture()
  await expect(f.run(true, '3:0')).rejects.toThrow('PRESENTATION_REVISION_CONFLICT')
  expect(f.collaboration.archiveDocument).not.toHaveBeenCalled()
  expect(f.revokeLinks).not.toHaveBeenCalled()
})
