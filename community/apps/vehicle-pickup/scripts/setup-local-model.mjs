import assert from 'node:assert/strict'

const apiUrl = requiredEnv('XPERT_API_URL').replace(/\/+$/, '')
const tenantId = requiredEnv('XPERT_TENANT_ID')
const organizationId = requiredEnv('XPERT_ORG_ID')
const deepSeekApiKey = requiredEnv('DEEPSEEK_API_KEY')
const providerName = 'openai-compatible'
const connectionName = 'DeepSeek'
const modelName = 'deepseek-flash'

const loginResponse = await request('/api/auth/login', {
  method: 'POST',
  auth: false,
  body: {
    email: requiredEnv('XPERT_USERNAME'),
    password: requiredEnv('XPERT_PASSWORD')
  }
})
const token = loginResponse.body?.token
assert.equal(typeof token, 'string', 'Login did not return a token')

const headers = {
  authorization: `Bearer ${token}`,
  'x-tenant-id': tenantId,
  'organization-id': organizationId
}

const credentialInput = {
  credentials: {
    api_key: deepSeekApiKey,
    endpoint_url: 'https://api.deepseek.com',
    api_protocol: 'chat',
    mode: 'chat',
    context_size: '128000',
    max_tokens_to_sample: '8192',
    function_calling_type: 'tool_call',
    stream_function_calling: 'supported',
    structured_output_support: 'supported',
    support_function_call: true,
    display_name: 'DeepSeek Flash'
  },
  validationTarget: {
    modelType: 'llm',
    model: modelName
  }
}

const providerList = await request('/api/copilot-provider?limit=100', { headers })
const providers = asArray(providerList.body)
let provider = providers.find(
  (item) => item.providerName === providerName && item.copilot?.name === connectionName
)

if (!provider) {
  const created = await request('/api/copilot-provider', {
    headers,
    method: 'POST',
    body: {
      providerName,
      connectionName
    }
  })
  provider = created.body
}

assert.ok(provider?.id, 'DeepSeek provider connection was not created')

const catalog = await request(`/api/copilot-provider/${provider.id}/model`, { headers })
const customModels = Array.isArray(catalog.body?.custom) ? catalog.body.custom : []
let model = customModels.find((item) => item.modelName === modelName && item.modelType === 'llm')

if (!model) {
  const created = await request(`/api/copilot-provider/${provider.id}/model`, {
    headers,
    method: 'POST',
    body: {
      providerName,
      modelName,
      modelType: 'llm',
      isValid: true,
      modelProperties: credentialInput.credentials
    }
  })
  model = created.body
}

assert.ok(model?.id, 'DeepSeek Flash model was not created')

await request(`/api/copilot-provider/${provider.id}/enabled-models`, {
  headers,
  method: 'PUT',
  body: {
    models: [{ model: modelName, modelType: 'llm' }]
  }
})

console.log(
  JSON.stringify(
    {
      providerId: provider.id,
      copilotId: provider.copilotId,
      providerName,
      connectionName,
      model: modelName,
      modelId: model.id,
      enabled: true
    },
    null,
    2
  )
)

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
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : JSON.stringify(body)
    throw new Error(`${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${message}`)
  }
  return { body, status: response.status }
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
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
