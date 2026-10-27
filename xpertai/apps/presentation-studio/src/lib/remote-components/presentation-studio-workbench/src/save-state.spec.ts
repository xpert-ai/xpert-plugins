import * as Y from 'yjs'
import { bytesToBase64 } from '@xpert-ai/plugin-sdk/collaboration-client'
import { serverContainsDocument } from './save-state'

describe('presentation persistence acknowledgement', () => {
  it('does not confuse an unchanged state vector with a persisted deletion', () => {
    const doc = new Y.Doc()
    doc.getText('title').insert(0, 'Team draft')
    const saved = bytesToBase64(Y.encodeStateAsUpdate(doc))
    expect(serverContainsDocument(doc, saved)).toBe(true)
    doc.getText('title').delete(0, 4)
    expect(serverContainsDocument(doc, saved)).toBe(false)
    expect(serverContainsDocument(doc, bytesToBase64(Y.encodeStateAsUpdate(doc)))).toBe(true)
    doc.destroy()
  })
  it('fails closed for a partial sync or malformed update', () => {
    const doc = new Y.Doc(); doc.getText('title').insert(0, 'Unsaved')
    expect(serverContainsDocument(doc, bytesToBase64(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(doc))))).toBe(false)
    expect(serverContainsDocument(doc, 'broken')).toBe(false)
    doc.destroy()
  })
})
