import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rpc } from './native-mcp-client.mjs'
const checkout = process.env.XPERT_HOST_CHECKOUT
const { default: Ajv } = await import(pathToFileURL(join(checkout, 'node_modules/ajv/dist/ajv.js')).href)
const { default: addFormats } = await import(pathToFileURL(join(checkout, 'node_modules/ajv-formats/dist/index.js')).href)
const ajv = addFormats(new Ajv({ strict: false }))
const { tools } = await rpc('tools/list', {}, { legacy: true, noInput: true })
assert.equal(tools.length, 38)
const receipt = {
  resultStatus: 'unavailable', errorCode: 'tool_result_unavailable', success: true,
  operationId: 'catalog-check', drawingId: 'drawing', sceneRevision: 2,
  message: 'The detailed result could not be prepared.', nextAction: 'Read the drawing; retain the original operationId.'
}
for (const tool of tools) {
  assert.equal(tool.outputSchema.type, 'object')
  const validate = ajv.compile(tool.outputSchema)
  assert.ok(validate(receipt), `${tool.name} does not accept its recovery receipt`)
  assert.equal(validate({ ...receipt, privateEntity: 'must-not-escape' }), false)
}
const evidence = { tools: tools.length, publishedRecoverySchemasValid: true, unknownOutputFieldsRejected: true }
const root = fileURLToPath(new URL('../test-output/result-recovery/', import.meta.url))
await mkdir(root, { recursive: true })
await writeFile(join(root, 'catalog.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence))
