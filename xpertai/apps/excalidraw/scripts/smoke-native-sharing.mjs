import { rpc, client } from './native-mcp-client.mjs'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const evidence = []
async function invoke(name, args, legacy) {
  const result = await rpc('tools/call', { name, arguments: args }, { legacy, noInput: true })
  assert.notEqual(result.resultType, 'input_required')
  assert.notEqual(result.isError, true, JSON.stringify(result.content))
  assert.ok(result.structuredContent)
  return result.structuredContent
}
try {
  for (const legacy of [true, false]) {
    const protocol = legacy ? '2025-11-25' : '2026-07-28'
    const operationId = randomUUID()
    const input = { title: 'Synthetic application policy acceptance', operationId }
    const created = await invoke('excalidraw_create_drawing', input, legacy)
    assert.deepEqual(await invoke('excalidraw_create_drawing', input, legacy), created)
    assert.deepEqual(Object.keys(created).sort(), ['drawingId', 'sceneRevision', 'status', 'success'])
    const drawingId = created.drawingId
    try {
      const edited = await invoke('excalidraw_add_elements', {
        drawingId, operationId: randomUUID(), elements: [{ id: 'notice', type: 'text', text: 'Synthetic public sharing test', x: 20, y: 20 }]
      }, legacy)
      const shareArgs = { drawingId, operationId: randomUUID(), expectedRevision: edited.sceneRevision, accessMode: 'public_link' }
      const stale = await rpc('tools/call', { name: 'excalidraw_publish_artifact_link', arguments: { ...shareArgs, expectedRevision: 0 } }, { legacy, noInput: true })
      assert.equal(stale.isError, true)
      const first = await invoke('excalidraw_publish_artifact_link', shareArgs, legacy)
      assert.equal((await invoke('excalidraw_publish_artifact_link', shareArgs, legacy)).shareUrl, first.shareUrl)
      assert.equal((await invoke('excalidraw_publish_artifact_link', { ...shareArgs, operationId: randomUUID() }, legacy)).shareUrl, first.shareUrl)
      assert.equal((await fetch(first.shareUrl)).ok, true)
      const summary = await invoke('excalidraw_get_drawing', { drawingId }, legacy)
      assert.ok(summary.title)
      assert.ok(!('item' in summary) && !('versions' in summary))
      evidence.push({ protocol, createWithoutElicitation: true, editWithoutElicitation: true, shareWithoutElicitation: true, idempotentRetry: true, staleRevisionRejected: true, shareReused: true, compactDrawing: true, receiptBytes: Buffer.byteLength(JSON.stringify(created)) })
    } finally {
      await invoke('excalidraw_revoke_artifact_link', { drawingId, operationId: randomUUID() }, legacy)
      await invoke('excalidraw_update_drawing_status', { drawingId, operationId: randomUUID(), status: 'archived' }, legacy)
    }
  }
  console.log(JSON.stringify(evidence))
} finally {
  const root = fileURLToPath(new URL('../test-output/policy-dto/', import.meta.url))
  await mkdir(root, { recursive: true })
  await writeFile(`${root}/sharing.json`, JSON.stringify(evidence, null, 2))
  await client.close()
}
