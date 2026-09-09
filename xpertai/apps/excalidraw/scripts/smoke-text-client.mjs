// Deliberately never reads structuredContent: this is the affected client's view.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { rpc } from './native-mcp-client.mjs'

const evidence = []
for (const legacy of [true, false]) {
  const drawings = []
  const results = []
  const invoke = (name, args) => rpc('tools/call', { name, arguments: args }, { legacy, noInput: true })
  async function textCall(name, args) {
    const result = await invoke(name, args)
    assert.notEqual(result.resultType, 'input_required')
    const text = result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n')
    assert.notEqual(result.isError, true, text)
    const dto = JSON.parse(text)
    results.push({ tool: name, keys: Object.keys(dto), textBytes: Buffer.byteLength(text) })
    return dto
  }
  try {
    const invalid = await invoke('excalidraw_create_drawing', {
      title: 1,
      tags: [false],
      unknownField: 'never-echo-this-value'
    })
    assert.equal(invalid.isError, true)
    const errorText = invalid.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n')
    for (const path of ['/title', '/tags/0', '/unknownField']) assert.ok(errorText.includes(path), errorText)
    assert.ok(!errorText.includes('never-echo-this-value'))

    const created = await textCall('excalidraw_create_drawing', {
      title: 'Synthetic text client acceptance',
      operationId: randomUUID()
    })
    const drawingId = created.drawingId
    assert.ok(drawingId)
    drawings.push(drawingId)
    const added = await textCall('excalidraw_add_elements', {
      drawingId,
      operationId: randomUUID(),
      elements: [{ id: randomUUID(), type: 'text', text: 'Synthetic text fallback', x: 20, y: 20 }]
    })
    assert.ok(added.changedIds[0])
    await textCall('excalidraw_patch_scene', {
      drawingId,
      operationId: randomUUID(),
      updateElements: [{ id: added.changedIds[0], text: 'Edited using the returned ID' }]
    })
    const drawing = await textCall('excalidraw_get_drawing', { drawingId })
    const checkpoint = await textCall('excalidraw_checkpoint_version', {
      drawingId,
      expectedRevision: drawing.sceneRevision,
      operationId: randomUUID()
    })
    assert.ok(checkpoint.versionId)
    const share = await textCall('excalidraw_publish_artifact_link', {
      drawingId,
      expectedRevision: checkpoint.sceneRevision,
      accessMode: 'public_link',
      operationId: randomUUID()
    })
    assert.ok(share.shareUrl)
    assert.ok((await fetch(share.shareUrl)).ok)
    await textCall('excalidraw_revoke_artifact_link', { drawingId, operationId: randomUUID() })

    const template = await textCall('excalidraw_template_inspect', { key: 'layered-architecture' })

    const badParameters = await invoke('excalidraw_template_instantiate', {
      key: template.key,
      parameters: { colorScheme: 'invalid-scheme' },
      operationId: randomUUID()
    })
    assert.equal(badParameters.isError, true)
    const parameterDetails = JSON.parse(badParameters.content.find((item) => item.type === 'text').text)
    assert.ok(parameterDetails.issues.some((issue) => issue.path === '/parameters/colorScheme'))
    const technical = await textCall('excalidraw_template_instantiate', {
      key: template.key,
      parameters: {},
      operationId: randomUUID()
    })
    drawings.push(technical.drawingId)
    const diagram = await textCall('excalidraw_diagram_get', { drawingId: technical.drawingId })
    const badIr = structuredClone(diagram.ir)
    badIr.nodes[0].size = { height: 1000 }
    const rejected = await invoke('excalidraw_diagram_create', { ir: badIr, operationId: randomUUID() })
    assert.equal(rejected.isError, true)
    const details = JSON.parse(rejected.content.find((item) => item.type === 'text').text)
    assert.equal(details.errorCode, 'diagram_validation_failed')
    assert.ok(details.validation.issues.some((issue) => issue.targetIds.includes(badIr.nodes[0].id)))
    assert.ok(details.validation.issues.every((issue) => issue.code && issue.message))

    const validated = await textCall('excalidraw_diagram_validate', {
      drawingId: technical.drawingId,
      expectedRevision: technical.irRevision,
      operationId: randomUUID()
    })
    assert.ok(Array.isArray(validated.validation.issues))
    const rendered = await textCall('excalidraw_diagram_render', {
      drawingId: technical.drawingId,
      expectedRevision: validated.irRevision,
      expectedSceneRevision: validated.sceneRevision,
      operationId: randomUUID()
    })
    let job = await textCall('excalidraw_create_preview', {
      drawingId: technical.drawingId,
      expectedRevision: rendered.sceneRevision,
      operationId: randomUUID()
    })
    const deadline = Date.now() + 180000
    while (!job.terminal && Date.now() < deadline)
      job = await textCall('excalidraw_wait_job', { jobId: job.jobId, cursor: job.cursor })
    assert.equal(job.status, 'succeeded')
    assert.equal(job.resultTool, 'excalidraw_read_preview')
    const image = await invoke(job.resultTool, { previewId: job.previewId })
    assert.notEqual(image.isError, true)
    assert.ok(image.content.some((item) => item.type === 'image' && item.data.length > 0))
    const imageMeta = JSON.parse(image.content.find((item) => item.type === 'text').text)
    assert.equal(imageMeta.drawingId, technical.drawingId)
    assert.ok(!('data' in imageMeta))
    let exported = await textCall('excalidraw_export_drawing', {
      drawingId: technical.drawingId,
      expectedRevision: rendered.sceneRevision,
      format: 'json',
      operationId: randomUUID()
    })
    const exportDeadline = Date.now() + 180000
    while (!exported.terminal && Date.now() < exportDeadline)
      exported = await textCall('excalidraw_wait_job', { jobId: exported.jobId, cursor: exported.cursor })
    assert.equal(exported.status, 'succeeded')
    assert.equal(exported.resultTool, 'excalidraw_read_export')
    const firstChunk = await textCall(exported.resultTool, { jobId: exported.jobId, offset: 0, limit: 1024 })
    assert.ok(firstChunk.sha256 && firstChunk.nextOffset)
    const secondChunk = await textCall(exported.resultTool, {
      jobId: exported.jobId,
      offset: firstChunk.nextOffset,
      limit: 1024
    })
    assert.deepEqual(Object.keys(secondChunk).sort(), ['data', 'jobId', 'nextOffset', 'offset'])
    evidence.push({
      protocol: legacy ? '2025-11-25' : '2026-07-28',
      textOnlyWorkflowPassed: true,
      nestedFieldDiagnostics: true,
      templateFieldDiagnostics: true,
      targetedGeometryDiagnostics: true,
      previewMetadataReadable: true,
      exportChunksReadable: true,
      results
    })
  } finally {
    for (const drawingId of drawings) {
      await textCall('excalidraw_revoke_artifact_link', { drawingId, operationId: randomUUID() })
      await textCall('excalidraw_update_drawing_status', { drawingId, status: 'archived', operationId: randomUUID() })
    }
  }
}
const root = fileURLToPath(new URL('../test-output/text-client/', import.meta.url))
await mkdir(root, { recursive: true })
await writeFile(`${root}/live.json`, JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence))
