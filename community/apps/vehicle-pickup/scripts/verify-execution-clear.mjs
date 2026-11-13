import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const apiUrl = requiredEnv('XPERT_API_URL').replace(/\/+$/, '')
const headers = {
  authorization: '',
  'organization-id': requiredEnv('XPERT_ORG_ID'),
  'x-tenant-id': requiredEnv('XPERT_TENANT_ID')
}

const login = await request('/api/auth/login', {
  auth: false,
  method: 'POST',
  body: {
    email: requiredEnv('XPERT_USERNAME'),
    password: requiredEnv('XPERT_PASSWORD')
  }
})
headers.authorization = `Bearer ${login.token}`

const assistant = await request('/api/xpert/slug/vehicle-pickup-assistant', { headers })
assert.ok(assistant?.id)

const mainViews = await request(
  `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/slots/${encodeURIComponent(
    'agent.workbench.main'
  )}/views`,
  { headers }
)
const fixedViews = await request(
  `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/slots/${encodeURIComponent(
    'agent.workbench.fixed'
  )}/views`,
  { headers }
)
const viewKey = [...asArray(mainViews), ...asArray(fixedViews)]
  .map((manifest) => manifest.key)
  .find((key) => typeof key === 'string' && key.includes('vehicle-pickup-workbench'))
assert.ok(viewKey, 'Vehicle pickup view was not registered')

await ask('帮我创建车架号 555555 的自提申请。')
const applied = findRequest(await getView('store'), '555555', 'applied')
assert.ok(applied, 'Request was not created')

const approved = await action('approver', 'approve', applied, { version: applied.version })
assert.equal(approved.data?.status, 'approved')

const failed = await action('carrier', 'execute', approved.data, {
  version: approved.data.version
})
assert.equal(failed.success, false)
assert.equal(failed.data?.executionFailureReason, '模拟承运商接口暂时不可用')

const executed = await action('carrier', 'execute', approved.data, {
  version: failed.data.version
})
assert.equal(executed.success, true)
assert.equal(executed.data?.status, 'executed')
assert.equal(executed.data?.executionFailureReason, null)
assert.equal(executed.data?.executionAttempts, 2)

const carrierView = await getView('carrier')
assert.equal(carrierView.viewer?.role, 'carrier')
assert.ok(
  carrierView.requests.some((item) => item.id === executed.data.id),
  'Executed request must be visible to carrier'
)

console.log(
  JSON.stringify(
    {
      requestNo: executed.data.requestNo,
      status: executed.data.status,
      executionAttempts: executed.data.executionAttempts,
      executionFailureReason: executed.data.executionFailureReason,
      carrierVisible: true
    },
    null,
    2
  )
)

async function getView(role) {
  const parameters = encodeURIComponent(JSON.stringify({ role }))
  return request(
    `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/views/${encodeURIComponent(
      viewKey
    )}/data?parameters=${parameters}`,
    { headers }
  )
}

async function action(role, actionKey, requestBody, input = {}) {
  return request(
    `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/views/${encodeURIComponent(
      viewKey
    )}/actions/${encodeURIComponent(actionKey)}`,
    {
      headers,
      method: 'POST',
      body: {
        targetId: requestBody.id,
        input: { role, ...input },
        parameters: { role }
      }
    }
  )
}

async function ask(message) {
  const response = await fetch(`${apiUrl}/api/xpert/${encodeURIComponent(assistant.id)}/chat`, {
    method: 'POST',
    headers: {
      ...headers,
      accept: 'text/event-stream',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      request: {
        action: 'send',
        message: {
          clientMessageId: randomUUID(),
          input: { input: message }
        }
      },
      options: { isDraft: false }
    })
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new Error(`Chat failed with HTTP ${response.status}: ${body?.message ?? JSON.stringify(body)}`)
  }
  const events = parseSse(await response.text())
  assert.equal(events.find((event) => event?.event === 'on_message_end')?.data?.status, 'success')
}

function findRequest(view, vehicleNo, status) {
  return view.requests.find(
    (request) =>
      request.status === status &&
      (request.vehicles ?? []).some((vehicle) => vehicle.vehicleNo === vehicleNo)
  )
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
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : JSON.stringify(body)
    throw new Error(`${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${message}`)
  }
  return body
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  return []
}

function parseSse(text) {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
    )
    .filter((data) => data && data !== '[DONE]')
    .map((data) => {
      try {
        return JSON.parse(data)
      } catch {
        return { raw: data }
      }
    })
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
