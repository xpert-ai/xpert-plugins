import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'
import { OpenCodeRuntimeStrategy } from '../dist/lib/opencode.strategy.js'
import { managedTarget } from './managed-fixture.mjs'
const workspaceId = '11111111-1111-4111-a111-111111111111'

test('OpenCode waits through completed tool steps, retries and newer incomplete messages before returning a final result', async (t) => {
  let state = 'busy'
  let messages = []
  let statusReads = 0
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const path = new URL(req.url, 'http://localhost').pathname
    let value
    if (path === '/session/status') {
      statusReads++
      value = state ? { session: { type: state } } : {}
    } else if (path === '/session') value = { id: 'session' }
    else if (req.method === 'POST') {
      messages = [
        {
          info: {
            role: 'assistant',
            parentID: JSON.parse(body).messageID,
            finish: 'tool-calls',
            time: { completed: 1 }
          },
          parts: [{ type: 'tool' }]
        }
      ]
      value = messages[0]
    } else value = messages
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(value))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const profiles = new RuntimeProfiles()
  const receipt = { tool: { id: 'opencode' }, workingDirectory: '/workspace/test' }
  const context = {
    invocationId: randomUUID(),
    scope: { workspaceId },
    checkpoint: async () => {},
    capabilities: {
      require: () => ({
        start: async (_id, checkpoint) => {
          await checkpoint(receipt)
          return receipt
        },
        inspect: async () => ({ state: 'running' }),
        stop: async () => ({ state: 'exited' }),
        request: async (_receipt, request) => {
          const response = await fetch(`http://127.0.0.1:${server.address().port}${request.path}`, {
            method: request.method,
            headers: { 'content-type': 'application/json' },
            ...(request.body ? { body: JSON.stringify(request.body) } : {})
          })
          return response.json()
        }
      })
    }
  }
  const strategy = new OpenCodeRuntimeStrategy(profiles)
  const started = await strategy.start({ target: managedTarget('opencode'), input: { prompt: 'fixture' } }, context)
  const inspect = () => strategy.inspect(started.handle, context)
  assert.equal((await inspect()).status, 'running')
  state = 'retry'
  assert.equal((await inspect()).status, 'running')
  state = undefined
  assert.equal((await inspect()).status, 'unknown', 'an idle intermediate tool step is not success')
  messages[0].info.finish = 'stop'
  assert.equal((await inspect()).status, 'unknown', 'tool calls can also be reported with finish=stop')
  messages[0].parts = [{ type: 'text', text: 'final answer' }]
  const finalMessage = structuredClone(messages[0])
  state = 'busy'
  assert.equal((await inspect()).status, 'running')
  state = 'idle'
  messages.push({ info: { role: 'assistant', parentID: started.handle.runId, time: {} }, parts: [] })
  assert.equal((await inspect()).status, 'unknown', 'never fall back to an older completed message')
  messages = [finalMessage]
  assert.equal((await inspect()).result.text, 'final answer')
  messages[0].info.error = { name: 'APIError' }
  assert.equal((await inspect()).status, 'failed')
})
