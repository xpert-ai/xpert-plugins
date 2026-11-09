import assert from 'node:assert/strict'

const apiUrl = requiredEnv('XPERT_API_URL').replace(/\/+$/, '')
const email = requiredEnv('XPERT_USERNAME')
const password = requiredEnv('XPERT_PASSWORD')
const tenantId = requiredEnv('XPERT_TENANT_ID')
const organizationId = requiredEnv('XPERT_ORG_ID')

const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
})
const loginBody = await readJson(loginResponse)
assert.equal(loginResponse.ok, true, `Login failed: ${loginBody.message ?? loginResponse.status}`)
assert.equal(typeof loginBody.token, 'string', 'Login did not return a token')

const headers = {
  authorization: `Bearer ${loginBody.token}`,
  'content-type': 'application/json',
  'x-tenant-id': tenantId,
  'organization-id': organizationId
}

const pluginsResult = await apiGet('/api/plugin')
assert.equal(pluginsResult.ok, true, `Plugin list failed: ${pluginsResult.body.message ?? pluginsResult.status}`)

const plugins = asArray(pluginsResult.body)
assert.equal(Array.isArray(plugins), true, 'Plugin list response is not an array')
const vehiclePickup = plugins.find(
  (plugin) => plugin.name === '@xpert-ai/plugin-vehicle-pickup' || plugin.packageName === '@xpert-ai/plugin-vehicle-pickup'
)
assert.ok(vehiclePickup, 'Vehicle pickup plugin is not registered')
assert.notEqual(vehiclePickup.loadStatus, 'error', `Vehicle pickup plugin has load error: ${vehiclePickup.loadError}`)

const templatesResult = await apiGet('/api/xpert-template?targetApp=data-xpert')
const templates = asArray(templatesResult.body)
const vehiclePickupTemplates = templates.filter(
  (template) =>
    template.key === 'vehicle-pickup-assistant' ||
    template.pluginName === '@xpert-ai/plugin-vehicle-pickup' ||
    template.providerKey === 'VehiclePickupTemplateProvider'
)
const catalogResult = await apiGet(
  `/api/xpert-template/catalog?pluginName=${encodeURIComponent('@xpert-ai/plugin-vehicle-pickup')}&limit=48`
)
const catalogTemplates = asArray(catalogResult.body)
const defaultWorkspaceResult = await apiGet('/api/xpert-workspace/my/default')
const workspaceResult = await apiGet('/api/xpert-workspace/my?limit=20')
const workspaces = asArray(workspaceResult.body)
const workspaceId = workspaces[0]?.id
assert.ok(workspaceId, 'No workspace is available for the vehicle pickup assistant')
const templateId = catalogTemplates[0]?.id
assert.ok(templateId, 'Vehicle pickup template is not present in the plugin catalog')
const templateSetupResult = await apiGet(
  `/api/xpert-template/${encodeURIComponent(templateId)}/setup?workspaceId=${encodeURIComponent(workspaceId)}`
)
const providersResult = await apiGet('/api/copilot-provider?limit=100')
const providers = asArray(providersResult.body)
const modelsResult = await apiGet('/api/copilot-model?limit=100')
const models = asArray(modelsResult.body)
const assistantResult = await apiGet('/api/xpert/slug/vehicle-pickup-assistant')
const viewRoleCounts = {}
if (assistantResult.body?.id) {
  const slots = ['agent.workbench.main', 'agent.workbench.fixed']
  const slotViews = []
  for (const slot of slots) {
    const result = await apiGet(
      `/api/view-hosts/agent/${encodeURIComponent(assistantResult.body.id)}/slots/${encodeURIComponent(slot)}/views`
    )
    slotViews.push(...asArray(result.body))
  }
  const viewKey =
    slotViews.find((manifest) => manifest.key?.endsWith('__vehicle-pickup-workbench'))?.key ??
    slotViews.find((manifest) => manifest.key?.includes('vehicle-pickup-workbench'))?.key
  for (const role of ['store', 'approver', 'carrier']) {
    const parameters = encodeURIComponent(JSON.stringify({ role }))
    const result = viewKey
      ? await apiGet(
          `/api/view-hosts/agent/${encodeURIComponent(assistantResult.body.id)}/views/${encodeURIComponent(viewKey)}/data?parameters=${parameters}`
        )
      : { status: 404, body: { message: 'Vehicle pickup view manifest not found' } }
    const data = result.body?.data ?? result.body
    viewRoleCounts[role] = {
      httpStatus: result.status,
      total: data?.requests?.length,
      statuses: data?.requests?.map((request) => request.status)
    }
  }
}

console.log(
  JSON.stringify(
    {
      plugin: {
        name: vehiclePickup.name ?? vehiclePickup.packageName,
        version: vehiclePickup.currentVersion ?? vehiclePickup.version,
        status: vehiclePickup.loadStatus ?? vehiclePickup.status,
        level: vehiclePickup.level,
        scopeKey: vehiclePickup.scopeKey
      },
      templates: {
        httpStatus: templatesResult.status,
        total: templates.length,
        responseKeys: Object.keys(templatesResult.body ?? {}),
        vehiclePickup: vehiclePickupTemplates.map((template) => ({
          id: template.id,
          key: template.key,
          name: template.name,
          title: template.title,
          pluginName: template.pluginName,
          providerKey: template.providerKey
        }))
      },
      catalog: {
        httpStatus: catalogResult.status,
        total: catalogTemplates.length,
        responseKeys: Object.keys(catalogResult.body ?? {}),
        vehiclePickup: catalogTemplates
          .filter(
            (template) =>
              template.key === 'vehicle-pickup-assistant' ||
              template.pluginName === '@xpert-ai/plugin-vehicle-pickup' ||
              template.source?.plugin === '@xpert-ai/plugin-vehicle-pickup'
          )
          .map((template) => ({
            id: template.id,
            key: template.key,
            name: template.name,
            title: template.title,
            pluginName: template.pluginName ?? template.source?.plugin
          }))
      },
      workspace: {
        defaultHttpStatus: defaultWorkspaceResult.status,
        defaultWorkspace: summarizeWorkspace(defaultWorkspaceResult.body),
        total: workspaces.length,
        items: workspaces.map(summarizeWorkspace)
      },
      setup: {
        httpStatus: templateSetupResult.status,
        canInstall: templateSetupResult.body?.canInstall,
        reason: templateSetupResult.body?.reason,
        checks: (templateSetupResult.body?.readiness?.checks ?? []).map((check) => ({
          key: check.key,
          status: check.status,
          required: check.required,
          message: check.message
        }))
      },
      models: {
        providersHttpStatus: providersResult.status,
        providerCount: providers.length,
        providers: providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          providerName: provider.providerName,
          enabled: provider.enabled
        })),
        modelsHttpStatus: modelsResult.status,
        modelCount: models.length,
        items: models.map((model) => ({
          id: model.id,
          name: model.name,
          model: model.model,
          providerId: model.providerId,
          enabled: model.enabled
        }))
      },
      viewRoles: viewRoleCounts
    },
    null,
    2
  )
)

async function apiGet(path) {
  const response = await fetch(`${apiUrl}${path}`, { headers })
  return { ok: response.ok, status: response.status, body: await readJson(response) }
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
  return []
}

function summarizeWorkspace(workspace) {
  if (!workspace) return null
  return {
    id: workspace.id,
    name: workspace.name,
    organizationId: workspace.organizationId,
    isDefault: workspace.isDefault
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}
