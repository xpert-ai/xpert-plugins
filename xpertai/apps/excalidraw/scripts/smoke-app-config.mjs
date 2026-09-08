// Read-only acceptance against a running host. Authentication remains in process memory.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkout = process.env.XPERT_HOST_CHECKOUT
const orgId = process.env.XPERT_ORGANIZATION_ID
assert.ok(checkout && orgId, 'Set XPERT_HOST_CHECKOUT and XPERT_ORGANIZATION_ID.')
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(join(resolve(checkout), 'tools/scripts/local-plugin-cli.mjs')).href
)
const args = { apiUrl: process.env.XPERT_API_URL ?? 'http://localhost:3333', scope: 'organization', orgId }
const auth = await requireAuthentication(args)
const headers = createRequestHeaders(args, auth.token, auth.tenantId)
const tenantHeaders = createRequestHeaders({ apiUrl: args.apiUrl, scope: 'tenant' }, auth.token, auth.tenantId)
// Explicitly omit organization context even when a shell has XPERT_ORG_ID configured.
delete tenantHeaders['organization-id']
async function get(path, requestHeaders = headers) {
  const response = await fetch(`${args.apiUrl}/api${path}`, { headers: requestHeaders })
  assert.ok(response.ok, `Host request ${path} failed (${response.status}).`)
  return response.json()
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const { excalidrawApp } = await import(pathToFileURL(join(root, 'dist/lib/excalidraw.app-config.js')).href)
const expectedConfig = {
  ...excalidrawApp.appConfig,
  presentation: {
    ...excalidrawApp.appConfig.presentation,
    screenshots: await Promise.all(excalidrawApp.appConfig.presentation.screenshots.map(async (path) =>
      `data:image/png;base64,${(await readFile(join(root, path))).toString('base64')}`
    ))
  }
}
const query = new URLSearchParams({ pluginName: packageJson.name, appName: excalidrawApp.name })
const [plugins, catalog, detail, missingScope] = await Promise.all([
  get('/plugin'), get('/plugin-applications/catalog'),
  get(`/plugin-applications/detail?${query}`), get(`/plugin-applications/detail?${query}`, tenantHeaders)
])
const descriptor = plugins.find((item) => item.name === packageJson.name)
assert.equal(descriptor?.currentVersion, packageJson.version)
assert.equal(descriptor?.loadStatus, 'loaded')
assert.equal(descriptor?.configurationStatus, 'valid')
const entries = catalog.filter((item) => item.application.pluginName === packageJson.name)
assert.equal(entries.length, 1, 'Exactly one Excalidraw App must be loaded.')
assert.deepEqual(detail.application.config, expectedConfig)
assert.deepEqual(entries[0].application.config, expectedConfig)
assert.equal(detail.application.assistantTemplateKey, 'excalidraw-assistant')
assert.equal(detail.preflight.supported, true)
assert.equal(missingScope.preflight.canInitialize, false)
assert.equal(missingScope.preflight.reason, 'organization_scope_required')
assert.equal(missingScope.preflight.embeddingModels.length, 0)
assert.equal(missingScope.preflight.visionModels.length, 0)

const { client } = await import('./native-mcp-client.mjs')
try {
  const { tools } = await client.listTools()
  assert.equal(tools.length, 38)
  const { resources } = await client.listResources()
  const preview = resources.find((resource) => resource.uri.endsWith('/excalidraw_preview'))
  assert.ok(preview)
  const resource = await client.readResource({ uri: preview.uri })
  assert.ok(resource.contents.some((item) => item.text?.includes('Excalidraw')))
  const fonts = await client.callTool({ name: 'excalidraw_list_typography_presets', arguments: {} })
  assert.ok(!fonts.isError)
  const evidence = {
    version: descriptor.currentVersion, loadStatus: descriptor.loadStatus,
    appName: detail.application.appName, templateKey: detail.application.assistantTemplateKey,
    configMatchesBundle: true, status: detail.status.status,
    screenshotCount: expectedConfig.presentation.screenshots.length,
    canInitialize: detail.preflight.canInitialize, preflightReason: detail.preflight.reason ?? null,
    primaryModelAvailable: detail.preflight.primaryModelAvailable, missingOrganizationRejected: true,
    mcpToolCount: tools.length, mcpResourceReadable: true, mcpReadCallPassed: true
  }
  await mkdir(join(root, 'test-output/app-config'), { recursive: true })
  await writeFile(join(root, 'test-output/app-config/installed.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence))
} finally {
  await client.close()
}
