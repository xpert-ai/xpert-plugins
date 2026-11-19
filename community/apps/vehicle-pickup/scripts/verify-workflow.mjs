import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const apiUrl = requiredEnv('XPERT_API_URL').replace(/\/+$/, '')
const tenantId = requiredEnv('XPERT_TENANT_ID')
const organizationId = requiredEnv('XPERT_ORG_ID')
const assistantSlug = 'vehicle-pickup-assistant'
const expectedViewKey = 'vehicle-pickup-workbench'

const login = await api('/api/auth/login', {
  auth: false,
  method: 'POST',
  body: {
    email: requiredEnv('XPERT_USERNAME'),
    password: requiredEnv('XPERT_PASSWORD')
  }
})
const headers = {
  authorization: `Bearer ${login.token}`,
  'organization-id': organizationId,
  'x-tenant-id': tenantId
}

const assistant = await api(`/api/xpert/slug/${encodeURIComponent(assistantSlug)}`, { headers })
assert.ok(assistant?.id, 'Vehicle pickup assistant was not found')
const slotViews = [
  ...(await getSlotViews('agent.workbench.main')),
  ...(await getSlotViews('agent.workbench.fixed'))
]
const viewManifest = slotViews.find((manifest) => manifest.key === expectedViewKey) ?? slotViews[0]
assert.ok(viewManifest?.key, 'Vehicle pickup workbench is not registered in an agent workbench slot')
const viewKey = viewManifest.key

const initial = await getView('store')
assert.equal(initial.viewer?.role, 'store')
assert.equal(initial.viewer?.canSwitchRole, true)
assert.equal(initial.requests.length, 0, 'Workflow test expects an empty pickup request table')

const validation = await ask('777777 和 999999 可以自提吗？')
assert.match(validation.finalText, /海关锁/)
assert.match(validation.finalText, /无权操作|不属于当前门店/)
assert.equal((await getView('store')).requests.length, 0)

const invalidCreate = await ask('帮我创建车架号 777777 的自提申请。')
assert.match(invalidCreate.finalText, /未创建|不能|不可自提/)
assert.equal(
  (await getView('store')).requests.some((item) => hasVehicle(item, '777777')),
  false,
  'Invalid vehicle must not create a request'
)

const created123334 = await ask('帮我创建车架号 123334 的自提申请。')
assert.match(created123334.finalText, /已申请|已创建/)
let requests = (await getView('store')).requests
const firstRequest = findLatest(requests, '123334')
assert.ok(firstRequest, '123334 request was not created')
assert.equal(firstRequest.status, 'applied')

await ask('帮我创建车架号 123334 的自提申请。')
requests = (await getView('store')).requests
assert.equal(
  requests.filter((item) => hasVehicle(item, '123334')).length,
  1,
  'Repeated create must reuse the active request'
)

const forbiddenApprove = await action('store', 'approve', firstRequest, {
  version: firstRequest.version
})
assert.equal(forbiddenApprove.success, false, 'Store role must not approve')

const simulatedIssue = await action('approver', 'simulate_vehicle_issue', null, {
  vehicleNo: '123334',
  vehicleStatus: 'customs_locked'
})
assert.equal(simulatedIssue.success, true)

const systemRejected = await action('approver', 'approve', firstRequest, {
  version: firstRequest.version
})
assert.equal(systemRejected.success, true)
assert.equal(systemRejected.data?.status, 'rejected')
assert.equal(systemRejected.data?.rejectionSource, 'system')
assert.match(systemRejected.data?.approvalReason ?? '', /^系统驳回：/)

const created124728 = await ask('帮我创建车架号 124728 的自提申请。')
assert.match(created124728.finalText, /已申请|已创建/)
const approvedRequest = findLatest((await getView('store')).requests, '124728')
assert.ok(approvedRequest)

const approved = await action('approver', 'approve', approvedRequest, {
  version: approvedRequest.version
})
assert.equal(approved.success, true)
assert.equal(approved.data?.status, 'approved')

const failedExecution = await action('carrier', 'execute', approved.data, {
  version: approved.data.version
})
assert.equal(failedExecution.success, false)
assert.equal(failedExecution.data?.status, 'approved')

const executed = await action('carrier', 'execute', approved.data, {
  version: failedExecution.data.version
})
assert.equal(executed.success, true)
assert.equal(executed.data?.status, 'executed')

await ask('帮我创建车架号 555555 的自提申请。')
const rejectedRequest = findLatest((await getView('store')).requests, '555555')
assert.ok(rejectedRequest)
const rejected = await action('approver', 'reject', rejectedRequest, {
  version: rejectedRequest.version,
  reason: '演示人工驳回：提车资料不完整'
})
assert.equal(rejected.success, true)
assert.equal(rejected.data?.status, 'rejected')
assert.equal(rejected.data?.rejectionSource, 'manual')

await ask('帮我创建车架号 555555 的自提申请。')
const cancelledRequest = findLatest((await getView('store')).requests, '555555', 'applied')
assert.ok(cancelledRequest)
const cancelled = await action('approver', 'cancel', cancelledRequest, {
  version: cancelledRequest.version,
  reason: '演示取消：客户改期'
})
assert.equal(cancelled.success, true)
assert.equal(cancelled.data?.status, 'cancelled')

const finalView = await getView('approver')
const statuses = Object.fromEntries(
  ['applied', 'approved', 'rejected', 'cancelled', 'executed'].map((status) => [
    status,
    finalView.requests.filter((request) => request.status === status).length
  ])
)
assert.equal(statuses.applied, 0)
assert.equal(statuses.approved, 0)
assert.equal(statuses.executed, 1)
assert.equal(statuses.rejected, 2)
assert.equal(statuses.cancelled, 1)

console.log(
  JSON.stringify(
    {
      assistantId: assistant.id,
      validation: {
        customsLock: /海关锁/.test(validation.finalText),
        storePermission: /无权操作|不属于当前门店/.test(validation.finalText)
      },
      invalidCreateBlocked: true,
      idempotentCreate: true,
      systemRejection: summarizeRequest(systemRejected.data),
      approvalAndExecution: summarizeRequest(executed.data),
      manualRejection: summarizeRequest(rejected.data),
      cancellation: summarizeRequest(cancelled.data),
      finalStatuses: statuses,
      totalRequests: finalView.requests.length
    },
    null,
    2
  )
)

async function getView(role) {
  const parameters = encodeURIComponent(JSON.stringify({ role }))
  const result = await api(
    `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/views/${viewKey}/data?parameters=${parameters}`,
    { headers }
  )
  return result.data ?? result
}

async function getSlotViews(slot) {
  const result = await api(
    `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/slots/${encodeURIComponent(slot)}/views`,
    { headers }
  )
  return Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : []
}

async function action(role, actionKey, request, input = {}) {
  const body = {
    ...(request?.id ? { targetId: request.id } : {}),
    input: {
      role,
      ...input
    },
    parameters: { role }
  }
  return api(
    `/api/view-hosts/agent/${encodeURIComponent(assistant.id)}/views/${viewKey}/actions/${encodeURIComponent(
      actionKey
    )}`,
    { headers, method: 'POST', body }
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
  const finalMessage = events.find((event) => event?.event === 'on_message_end')?.data
  const finalText = Array.isArray(finalMessage?.content)
    ? finalMessage.content
        .filter((item) => item?.type === 'text')
        .map((item) => item.text)
        .join('')
    : ''
  const agentEnd = events.find((event) => event?.event === 'on_agent_end')?.data
  assert.equal(finalMessage?.status ?? agentEnd?.status, 'success', `Chat failed for: ${message}`)
  assert.ok(finalText, `Chat returned no text for: ${message}`)
  return {
    finalText,
    conversationId: finalMessage?.conversationId,
    threadId: finalMessage?.createdInThreadId
  }
}

function findLatest(requests, vehicleNo, status) {
  return requests.find(
    (request) => hasVehicle(request, vehicleNo) && (!status || request.status === status)
  )
}

function hasVehicle(request, vehicleNo) {
  return (request.vehicles ?? []).some((vehicle) => vehicle.vehicleNo === vehicleNo)
}

function summarizeRequest(request) {
  return request
    ? {
        id: request.id,
        requestNo: request.requestNo,
        status: request.status,
        rejectionSource: request.rejectionSource,
        approvalReason: request.approvalReason,
        executionAttempts: request.executionAttempts,
        vehicles: (request.vehicles ?? []).map((vehicle) => vehicle.vehicleNo)
      }
    : null
}

async function api(path, options = {}) {
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

function parseSse(text) {
  const events = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') continue
    try {
      events.push(JSON.parse(data))
    } catch {
      events.push({ raw: data })
    }
  }
  return events
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
