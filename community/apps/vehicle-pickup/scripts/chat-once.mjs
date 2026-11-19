import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const apiUrl = requiredEnv('XPERT_API_URL').replace(/\/+$/, '')
const tenantId = requiredEnv('XPERT_TENANT_ID')
const organizationId = requiredEnv('XPERT_ORG_ID')
const message = process.env.CHAT_MESSAGE || '你好，请介绍一下你的能力。'

const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: requiredEnv('XPERT_USERNAME'),
    password: requiredEnv('XPERT_PASSWORD')
  })
})
const login = await readJson(loginResponse)
assert.equal(loginResponse.ok, true, `Login failed: ${login?.message ?? loginResponse.status}`)

const authHeaders = {
  authorization: `Bearer ${login.token}`,
  'organization-id': organizationId,
  'x-tenant-id': tenantId
}

const assistantResponse = await fetch(
  `${apiUrl}/api/xpert/slug/${encodeURIComponent('vehicle-pickup-assistant')}`,
  { headers: authHeaders }
)
const assistant = await readJson(assistantResponse)
assert.equal(assistantResponse.ok, true, `Assistant lookup failed: ${assistant?.message ?? assistantResponse.status}`)

const conversationId = process.env.CHAT_CONVERSATION_ID || undefined
const response = await fetch(`${apiUrl}/api/xpert/${encodeURIComponent(assistant.id)}/chat`, {
  method: 'POST',
  headers: {
    ...authHeaders,
    accept: 'text/event-stream',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    request: {
      action: 'send',
      ...(conversationId ? { conversationId } : {}),
      message: {
        clientMessageId: randomUUID(),
        input: { input: message }
      }
    },
    options: {
      isDraft: false
    }
  })
})

if (!response.ok) {
  const body = await readJson(response)
  throw new Error(`Chat failed with HTTP ${response.status}: ${body?.message ?? JSON.stringify(body)}`)
}

const streamText = await response.text()
const events = parseSse(streamText)
const finalMessage = events.find((event) => event?.event === 'on_message_end')?.data
const agentEnd = events.find((event) => event?.event === 'on_agent_end')?.data
const toolEvents = events
  .filter((event) => {
    const name = event?.event ?? event?.type
    return typeof name === 'string' && name.includes('tool')
  })
  .map((event) => ({
    type: event.event ?? event.type,
    name: event.data?.name ?? event.data?.tool ?? event.data?.toolName,
    input: event.data?.input ?? event.data?.toolInput,
    output: event.data?.output ?? event.data?.result
  }))
console.log(
  JSON.stringify(
    {
      assistantId: assistant.id,
      message,
      eventCount: events.length,
      conversationId: finalMessage?.conversationId,
      threadId: finalMessage?.createdInThreadId,
      status: finalMessage?.status,
      finalText: Array.isArray(finalMessage?.content)
        ? finalMessage.content
            .filter((item) => item?.type === 'text')
            .map((item) => item.text)
            .join('')
        : undefined,
      toolEvents,
      agentStatus: agentEnd?.status,
      error: agentEnd?.error
    },
    null,
    2
  )
)

function parseSse(text) {
  const events = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
    if (!dataLines.length) continue
    const data = dataLines.join('\n')
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
