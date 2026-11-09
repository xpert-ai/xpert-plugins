import assert from 'node:assert/strict'

const apiUrl = requiredEnv('XPERT_API_URL').replace(/\/+$/, '')
const tenantId = requiredEnv('XPERT_TENANT_ID')
const organizationId = requiredEnv('XPERT_ORG_ID')
const templateId = '@xpert-ai/plugin-vehicle-pickup:vehicle-pickup-assistant'
const assistantName = 'vehicle-pickup-assistant'
const assistantTitle = '车辆自提助手'

const loginResponse = await request('/api/auth/login', {
  auth: false,
  method: 'POST',
  body: {
    email: requiredEnv('XPERT_USERNAME'),
    password: requiredEnv('XPERT_PASSWORD')
  }
})
const headers = {
  authorization: `Bearer ${loginResponse.body.token}`,
  'organization-id': organizationId,
  'x-tenant-id': tenantId
}

const workspaceList = await request('/api/xpert-workspace/my?limit=20', { headers })
const workspace = asArray(workspaceList.body)[0]
assert.ok(workspace?.id, 'No workspace is available')

const setup = await request(
  `/api/xpert-template/${encodeURIComponent(templateId)}/setup?workspaceId=${encodeURIComponent(workspace.id)}`,
  { headers }
)
assert.equal(setup.body?.canInstall, true, setup.body?.reason ?? 'Vehicle pickup template cannot be installed')
assert.ok(Array.isArray(setup.body?.models) && setup.body.models.length > 0, 'No DeepSeek model is available')

const existingBySlug = await request(`/api/xpert/slug/${encodeURIComponent(assistantName)}`, {
  headers,
  allowNotFound: true
})
const existing =
  (existingBySlug.body?.id ? existingBySlug.body : null) ??
  findAssistant(
    await request(
      `/api/xpert/by-workspace/${encodeURIComponent(workspace.id)}?published=true&data=${encodeURIComponent(
        JSON.stringify({ take: 100 })
      )}`,
      { headers }
    )
  ) ??
  findAssistant(
    await request(`/api/xpert/my?data=${encodeURIComponent(JSON.stringify({ take: 100 }))}`, { headers })
  )
if (existing) {
  console.log(JSON.stringify(summarizeAssistant(existing, true), null, 2))
  process.exit(0)
}

const selectedModel = setup.body.models[0]
const install = await request(`/api/xpert-template/${encodeURIComponent(templateId)}/install`, {
  headers,
  method: 'POST',
  body: {
    workspaceId: workspace.id,
    publish: true,
    locale: 'zh-Hans',
    capabilities: [],
    basic: {
      name: assistantName,
      title: assistantTitle,
      description: '通过对话校验车辆并创建自提申请，在统一工作台完成审批、取消和模拟运输执行。',
      copilotModel: selectedModel.copilotModel
    }
  }
})

const installed =
  findAssistant(
    await request(
      `/api/xpert/by-workspace/${encodeURIComponent(workspace.id)}?published=true&data=${encodeURIComponent(
        JSON.stringify({ take: 100 })
      )}`,
      { headers }
    )
  ) ??
  findAssistant(install) ??
  install.body
console.log(
  JSON.stringify(
    {
      ...summarizeAssistant(installed, false),
      installResponseKeys: Object.keys(install.body ?? {})
    },
    null,
    2
  )
)

function findAssistant(value) {
  const candidates = [
    ...(asArray(value).length ? asArray(value) : []),
    ...(Array.isArray(value?.items) ? value.items : []),
    ...(Array.isArray(value?.xperts) ? value.xperts : []),
    ...(value?.xpert ? [value.xpert] : []),
    ...(value?.id ? [value] : [])
  ]
  return candidates.find(
    (item) => item.name === assistantName || item.title === assistantTitle || item.slug === assistantName
  )
}

function summarizeAssistant(assistant, existing) {
  return {
    existing,
    id: assistant.id,
    name: assistant.name,
    title: assistant.title,
    slug: assistant.slug,
    version: assistant.version,
    published: assistant.published,
    workspaceId: assistant.workspaceId
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.auth === false ? {} : options.headers)
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  })
  const body = await readJson(response)
  if (!response.ok && !(options.allowNotFound && response.status === 404)) {
    const message = typeof body?.message === 'string' ? body.message : JSON.stringify(body)
    throw new Error(`${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${message}`)
  }
  return { body, status: response.status }
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.data?.items)) return value.data.items
  return []
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
