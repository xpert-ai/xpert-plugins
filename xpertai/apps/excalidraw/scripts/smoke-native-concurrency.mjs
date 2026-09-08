import { client, call, wait } from './native-mcp-client.mjs'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const evidence = []
const root = fileURLToPath(new URL('../test-output/mcp/', import.meta.url))
async function record(name, run) {
  const result = await run()
  evidence.push({ name, passed: true, ...result })
  console.log(`${name}: passed`)
}
try {
  const input = { title: `MCP concurrency acceptance ${new Date().toISOString()}`, operationId: randomUUID() }
  const created = await Promise.all([
    call('excalidraw_create_drawing', input),
    call('excalidraw_create_drawing', input)
  ])
  assert.deepEqual(created[0], created[1])
  const drawingId = created[0].drawingId
  evidence.push({ name: 'concurrent-operation-replay', passed: true, drawingId })
  await call('excalidraw_add_elements', {
    drawingId,
    operationId: randomUUID(),
    elements: [
      { id: 'left', type: 'rectangle', x: 10, y: 10, width: 160, height: 100 },
      { id: 'right', type: 'rectangle', x: 240, y: 10, width: 160, height: 100 }
    ]
  })
  await record('concurrent-targeted-edits', async () => {
    const inputs = ['left', 'right'].map((id, index) => ({
      drawingId,
      operationId: randomUUID(),
      updateElements: [{ id, y: 100 + index * 100 }]
    }))
    const results = await Promise.allSettled(inputs.map((input) => call('excalidraw_patch_scene', input)))
    for (let index = 0; index < results.length; index++)
      if (results[index].status === 'rejected') await call('excalidraw_patch_scene', inputs[index])
    for (const [index, id] of ['left', 'right'].entries()) {
      const result = await call('excalidraw_get_scene_item', { drawingId, itemType: 'element', elementId: id })
      assert.equal(result.item.y, 100 + index * 100)
    }
    return { drawingId }
  })
  await record('stale-replacement-rejected', async () => {
    const result = await client.callTool({
      name: 'excalidraw_save_scene_version',
      arguments: { drawingId, operationId: randomUUID(), expectedRevision: 0, elements: [] }
    })
    assert.equal(result.isError, true)
    return {}
  })
  await record('concurrent-preview-deduplication', async () => {
    const jobs = await Promise.all(
      [1, 2].map(() => call('excalidraw_create_preview', { drawingId, operationId: randomUUID() }))
    )
    assert.equal(jobs[0].jobId, jobs[1].jobId)
    const completed = await wait(jobs[0])
    assert.equal(completed.status, 'succeeded')
    return { jobId: completed.jobId }
  })
  await record('mermaid-conflict-preserves-current-scene', async () => {
    const current = await call('excalidraw_get_drawing', { drawingId })
    const job = await call('excalidraw_convert_mermaid', {
      drawingId,
      operationId: randomUUID(),
      expectedRevision: current.sceneRevision,
      mermaidSource: 'flowchart LR\n A[Input] --> B[Output]'
    })
    await call('excalidraw_patch_scene', {
      drawingId,
      operationId: randomUUID(),
      updateElements: [{ id: 'left', x: 77 }]
    })
    const completed = await wait(job)
    assert.equal(completed.status, 'conflict')
    const output = await call('excalidraw_read_export', { jobId: completed.jobId })
    assert.equal(output.mimeType, 'application/json')
    const left = await call('excalidraw_get_scene_item', { drawingId, itemType: 'element', elementId: 'left' })
    assert.equal(left.item.x, 77)
    return { jobId: completed.jobId }
  })
  await record('cancelled-job-stays-cancelled', async () => {
    const job = await call('excalidraw_export_drawing', { drawingId, format: 'png', operationId: randomUUID() })
    const cancel = { jobId: job.jobId, operationId: randomUUID() }
    const cancelled = await call('excalidraw_cancel_job', cancel)
    assert.equal(cancelled.status, 'cancelled')
    assert.deepEqual(await call('excalidraw_cancel_job', cancel), cancelled)
    await new Promise((resolve) => setTimeout(resolve, 3000))
    assert.equal((await call('excalidraw_get_job', { jobId: job.jobId })).status, 'cancelled')
    return { jobId: job.jobId }
  })
} finally {
  await mkdir(root, { recursive: true })
  await writeFile(`${root}/concurrency-workflow.json`, JSON.stringify(evidence, null, 2))
  await client.close()
}
