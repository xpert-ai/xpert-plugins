import { createHash } from 'node:crypto'
import { ProjectFilesRuntimeCapability, WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { PresentationDeck } from './entities/index.js'
import { persistPresentationSource } from './presentation-source.js'

describe('presentation source projection', () => {
  function fixture() {
    const bytes = Buffer.from('image bytes')
    const deck = { revision: 7, deckSpec: { title: 'Shared deck' }, editorState: {}, yjsStateBase64: 'state' }
    let locked = false
    const repository = {
      findOne: jest.fn(async () => { locked = true; return deck }),
      update: jest.fn(async () => { expect(locked).toBe(true) })
    }
    const assets = { find: jest.fn(async () => {
      expect(locked).toBe(true)
      return [{ id: 'asset', fileName: 'image.png', role: 'image', sha256: createHash('sha256').update(bytes).digest('hex'), fileReference: { reference: {} } }]
    }) }
    const files = { mkdir: jest.fn(), write: jest.fn(async (_input: { buffer: Buffer }) => { expect(locked).toBe(true) }), read: jest.fn() }
    const workspace = { readBuffer: jest.fn(async () => ({ buffer: bytes })) }
    const runtime = { require: jest.fn(key => key === ProjectFilesRuntimeCapability ? files : key === WorkspaceFilesRuntimeCapability ? workspace : undefined) }
    const manager = { transaction: async <T>(work: (manager: object) => Promise<T>) => {
      try { return await work({ getRepository: (entity: object) => entity === PresentationDeck ? repository : assets }) }
      finally { locked = false }
    } }
    const project = () => persistPresentationSource(runtime as never, { manager } as never, assets as never,
      { projectId: 'project', tenantId: 'tenant', organizationId: 'org', userId: 'member' }, 'deck')
    return { project, repository, files, workspace, bytes }
  }

  it('locks the native Deck while reading dependencies and committing the immutable snapshot pointer', async () => {
    const f = fixture()
    expect(await f.project()).toBe('synced')
    expect(f.repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }))
    expect(f.files.write).toHaveBeenCalledWith(expect.objectContaining({ expectedHash: null, projectId: 'project' }))
    const source = JSON.parse(f.files.write.mock.calls[0][0].buffer.toString())
    expect(source.revision).toBe(7)
    expect(Buffer.from(source.assets[0].content, 'base64')).toEqual(f.bytes)
    expect(f.repository.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 7 }), expect.objectContaining({ sourceSyncFailed: false }))
  })

  it('keeps the previous pointer and records failure when an asset no longer matches its recorded hash', async () => {
    const f = fixture()
    f.workspace.readBuffer.mockResolvedValue({ buffer: Buffer.from('modified externally') })
    expect(await f.project()).toBe('failed')
    expect(f.files.write).not.toHaveBeenCalled()
    expect(f.repository.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 7 }), { sourceSyncFailed: true })
  })

  it('repairs a failed file write on retry without altering the authoritative document', async () => {
    const f = fixture()
    f.files.mkdir.mockRejectedValueOnce(new Error('disk unavailable'))
    expect(await f.project()).toBe('failed')
    expect(f.files.write).not.toHaveBeenCalled()
    expect(await f.project()).toBe('synced')
    expect(f.repository.update).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 7 }), expect.objectContaining({ sourceRevision: 7, sourceSyncFailed: false }))
  })
})
