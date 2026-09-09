import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { call, client, wait } from './native-mcp-client.mjs'

const evidence = []
async function inspect(name, args) {
  const result = await call(name, args)
  evidence.push({ tool: name, keys: Object.keys(result), bytes: Buffer.byteLength(JSON.stringify(result)) })
  return result
}
let drawingId
try {
  const templates = await inspect('excalidraw_template_list', {})
  assert.ok(templates.items.length)
  assert.ok(templates.items.every((item) => !('preview' in item)))
  const template = await inspect('excalidraw_template_inspect', { key: 'layered-architecture' })
  assert.deepEqual(Object.keys(template).sort(), ['defaults', 'inputSchema', 'key', 'labels', 'version'])
  const created = await inspect('excalidraw_template_instantiate', {
    key: template.key, parameters: {}, operationId: randomUUID()
  })
  drawingId = created.drawingId
  const diagram = await inspect('excalidraw_diagram_get', { drawingId })
  assert.deepEqual(Object.keys(diagram).sort(), ['drawingId', 'ir', 'irRevision', 'status'])
  const validated = await inspect('excalidraw_diagram_validate', {
    drawingId, expectedRevision: diagram.irRevision, operationId: randomUUID()
  })
  assert.ok(Array.isArray(validated.validation.issues))
  assert.ok(Number.isInteger(validated.validation.issueTotal))
  const quality = await inspect('excalidraw_diagram_get_quality_report', { drawingId, issueLimit: 1 })
  assert.ok((quality.validationReport?.issues.length ?? 0) <= 1)
  assert.ok(!('qualityArtifacts' in quality) && !('renderedExcalidrawVersionId' in quality))
  const rendered = await inspect('excalidraw_diagram_render', {
    drawingId, expectedRevision: validated.irRevision,
    expectedSceneRevision: validated.sceneRevision, operationId: randomUUID()
  })
  const checkpoint = await inspect('excalidraw_checkpoint_version', {
    drawingId, expectedRevision: rendered.sceneRevision, operationId: randomUUID()
  })
  assert.ok(checkpoint.versionId)
  const versions = await inspect('excalidraw_list_versions', { drawingId })
  assert.ok(versions.items.some((item) => item.versionId === checkpoint.versionId))
  assert.ok(versions.items.every((item) => !('drawingId' in item) && !('scene' in item)))
  const summary = await inspect('excalidraw_get_drawing', { drawingId })
  assert.ok(summary.elementTotal > 0)
  const job = await wait(await inspect('excalidraw_export_drawing', {
    drawingId, expectedRevision: summary.sceneRevision, format: 'json', operationId: randomUUID()
  }))
  assert.equal(job.status, 'succeeded')
  const first = await inspect('excalidraw_read_export', { jobId: job.jobId, offset: 0, limit: 1024 })
  assert.ok(first.sha256 && first.nextOffset)
  const second = await inspect('excalidraw_read_export', { jobId: job.jobId, offset: first.nextOffset, limit: 1024 })
  assert.deepEqual(Object.keys(second).sort(), ['data', 'jobId', 'nextOffset', 'offset'])
  console.log(JSON.stringify({ passed: true, tools: evidence.length, results: evidence }))
} finally {
  if (drawingId) await call('excalidraw_update_drawing_status', { drawingId, status: 'archived', operationId: randomUUID() })
  const root = fileURLToPath(new URL('../test-output/policy-dto/', import.meta.url))
  await mkdir(root, { recursive: true })
  await writeFile(`${root}/dtos.json`, JSON.stringify(evidence, null, 2))
  await client.close()
}
