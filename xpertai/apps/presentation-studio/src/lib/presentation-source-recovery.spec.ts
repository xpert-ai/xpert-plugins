import { createHash, randomUUID } from 'node:crypto'
import { createPresentationYDoc, encodeYDoc, materializePresentationYDoc } from './presentation-yjs.js'
import { DASHIAI_UPSTREAM_COMMIT } from './constants.js'
import { parsePresentationSource, recoverPresentationSource } from './presentation-source-recovery.js'
import { PresentationAsset, PresentationDeck } from './entities/index.js'
import { ProjectAccessRuntimeCapability } from '@xpert-ai/plugin-sdk'

describe('presentation source recovery', () => {
  function backup() {
    const assetId = randomUUID(), bytes = Buffer.from('png fixture'), spec = { kind: 'standard' as const, title: 'Backup', goal: 'Recover', themePack: 'theme01' as const,
      pageCount: 1, slides: [{ id: 'slide-1', layout: 'cover', status: 'active' as const, props: { image: `asset://${assetId}` } }] }
    const doc = createPresentationYDoc(spec), model = materializePresentationYDoc(doc)
    const source = { format: 'presentation-studio.source', schemaVersion: 2, rendererCommit: DASHIAI_UPSTREAM_COMMIT, deckId: randomUUID(), revision: 7,
      deckSpec: model.spec, editorState: model.editorState, yjsStateBase64: encodeYDoc(doc).stateBase64,
      assets: [{ id: assetId, slideId: null, role: 'image', fileName: 'image.png', mimeType: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), encoding: 'base64', content: bytes.toString('base64') }] }
    doc.destroy()
    return { source, bytes, buffer: () => Buffer.from(JSON.stringify(source)) }
  }
  it('validates media and both native model representations before recovering', () => {
    const b = backup()
    expect(parsePresentationSource(b.buffer()).revision).toBe(7)
    b.source.deckSpec.title = 'uncoordinated external edit'
    expect(() => parsePresentationSource(b.buffer())).toThrow('PRESENTATION_SOURCE_INVALID')
    const changed = backup(); changed.source.assets[0].content = Buffer.from('wrong bytes').toString('base64')
    expect(() => parsePresentationSource(changed.buffer())).toThrow('PRESENTATION_SOURCE_INVALID')
    const unsupported = backup(); unsupported.source.schemaVersion = 99
    expect(() => parsePresentationSource(unsupported.buffer())).toThrow('PRESENTATION_SOURCE_INVALID')
  })
  it('rebuilds a new Yjs resource with new asset IDs and immutable bytes; retries cannot overwrite it', async () => {
    const b = backup(), requestId = randomUUID(), files = new Map<string, Buffer>()
    let deck: PresentationDeck | null = null, assets: PresentationAsset[] = []
    const query = { insert: () => query, values: (value: PresentationDeck) => { deck = { ...value }; return query },
      setParameters: (values: { spec: string; editor: string }) => { deck!.deckSpec = JSON.parse(values.spec); deck!.editorState = JSON.parse(values.editor); return query },
      orIgnore: () => query, returning: () => query, execute: async () => ({ raw: [{ id: requestId }] }) }
    const repo = { findOneBy: async () => deck, createQueryBuilder: () => query,
      manager: { transaction: async (work: (manager: object) => Promise<void>) => work({ getRepository: (entity: object) => entity === PresentationDeck ? repo : {
        save: async (value: PresentationAsset[]) => { assets = value }
      } }) } }
    const project = { assertAssistant: jest.fn(), assertEdit: jest.fn() }
    const filesystem = { mkdir: jest.fn(), write: async (input: { path: string; buffer: Buffer; expectedHash: null }) => {
      expect(input.expectedHash).toBeNull(); files.set(input.path, input.buffer)
    } }
    const runtime = { require: (key: unknown) => key === ProjectAccessRuntimeCapability ? project : filesystem }
    const scope = { tenantId: 'tenant', organizationId: 'org', projectId: 'project', userId: 'member' }
    const run = (buffer = b.buffer()) => recoverPresentationSource(runtime as never, repo as never, scope, requestId, buffer, () => undefined, { maxAssetBytes: 1000, maxDeckMediaBytes: 1000 })
    await run()
    expect(assets).toHaveLength(1)
    expect(assets[0].id).not.toBe(b.source.assets[0].id)
    expect(assets[0].deckId).toBe(requestId)
    const restored = await repo.findOneBy()
    expect(restored!.deckSpec.slides[0].props.image).toBe(`asset://${assets[0].id}`)
    expect(restored!.currentVersionNumber).toBe(0)
    expect([...files.values()]).toEqual([b.bytes])
    await run(); expect(files.size).toBe(1)
    await expect(run(Buffer.from('{}'))).rejects.toThrow('PRESENTATION_SOURCE_REQUEST_CONFLICT')
  })
})
