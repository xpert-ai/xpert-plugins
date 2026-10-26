import * as Y from 'yjs'
import { observeDeckTitle } from './collaboration-metadata'

it('updates metadata from another client without needing a local tool event', () => {
  const remote = new Y.Doc(), local = new Y.Doc(), changed = jest.fn()
  const stop = observeDeckTitle(local, changed)
  remote.getMap('deck').set('title', 'Original title')
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote))
  remote.getMap('deck').set('title', 'Agent renamed')
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote))
  expect(changed.mock.calls).toEqual([['Original title'], ['Agent renamed']])
  // Replaying a snapshot or changing other content must not reset host tab state.
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote))
  local.getMap('deck').set('goal', 'Other metadata')
  local.getMap('texts').set('body', 'Human body')
  expect(changed).toHaveBeenCalledTimes(2)
  stop()
  local.getMap('deck').set('title', 'After closing')
  expect(changed).toHaveBeenCalledTimes(2)
  local.destroy(); remote.destroy()
})

it('hydrates an existing title and ignores absent or invalid metadata', () => {
  const doc = new Y.Doc(), changed = jest.fn()
  doc.getMap('deck').set('title', 'Existing title')
  const stop = observeDeckTitle(doc, changed)
  doc.getMap('deck').delete('title')
  doc.getMap('deck').set('title', 42)
  doc.getMap('deck').set('title', ' ')
  expect(changed.mock.calls).toEqual([['Existing title']])
  stop(); doc.destroy()
})
