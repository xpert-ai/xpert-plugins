import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SpaceReferences, rasterMime } from '../src/references.js'

test('image previews reject markup even with a spoofed image MIME type', () => {
  for (const text of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<script>bad()</script>', 'not an image']) assert.equal(rasterMime(Buffer.from(text)), null)
  assert.equal(rasterMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png')
  assert.equal(rasterMime(Buffer.from('GIF89a')), 'image/gif')
})
test('references enforce same project, recheck actual bytes, and resolve renamed paths', async () => {
  const scope = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' }, projectId: 'project', sourceResourceId: 'page' }
  const target = { kind: 'image' as const, providerKey: 'spaces', resourceId: 'image' }
  let path = 'image.png', spaceId = 'space', bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), reads = 0
  const service = new SpaceReferences({ resource: async (_: unknown, id: string) => ({
    space: { id: id === 'page' ? 'space' : spaceId, projectId: 'project' }, item: { id, kind: id === 'page' ? 'page' : 'file' }
  }) } as never, { current: async () => ({ fileName: path, mimeType: 'image/png', reference: { filePath: path } }) } as never,
  { read: async () => { reads++; return { buffer: bytes } } } as never)
  assert.equal((await service.resolveReference({ ...scope, target })).fileName, 'image.png')
  path = '新目录/改名.png'
  assert.equal((await service.resolveReference({ ...scope, target })).fileName, path)
  bytes = Buffer.from('<svg/>'); await assert.rejects(() => service.resolveReference({ ...scope, target }), /image_format_unsupported/)
  spaceId = 'other'; await assert.rejects(() => service.resolveReference({ ...scope, target }), /access_denied/)
  assert.equal(reads, 3)
})
