import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { TriageModel } from '../dist/model.js'

const source = 'The Save button is disabled after entering a valid name.'
const result = {
  summary: 'Cannot save a name',
  category: 'bug',
  quote: 'Save button is disabled',
  nextStep: 'Verify the validation state.',
}

async function fixture(t, handler) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  )
  const base = `http://127.0.0.1:${server.address().port}/v1`
  const env = { FEEDBACK_TRIAGE_MODEL_BASE_URL: base, FEEDBACK_TRIAGE_MODEL_NAME: 'test-only' }
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key]
    t.after(() => {
      if (old === undefined) delete process.env[key]
      else process.env[key] = old
    })
    process.env[key] = value
  }
  return new TriageModel()
}

test('sends source as untrusted user content and accepts a grounded structured completion', async (t) => {
  let sent
  const model = await fixture(t, async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions')
    let content = ''
    for await (const chunk of req) content += chunk.toString()
    sent = JSON.parse(content)
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }))
  })
  assert.deepEqual(await model.extract(source), result)
  assert.deepEqual(sent.messages[1], { role: 'user', content: source })
  assert.equal(sent.response_format.type, 'json_schema')
  assert.deepEqual(sent.response_format.json_schema.schema.properties.quote.enum, [source])
})

test('rejects malformed, ungrounded and oversized results', async (t) => {
  const answers = [
    '{"unexpected":true}',
    JSON.stringify({ ...result, quote: 'This was a payment failure.' }),
    'x'.repeat(50000),
  ]
  const model = await fixture(t, (_req, res) =>
    res.end(JSON.stringify({ choices: [{ message: { content: answers.shift() } }] })),
  )
  for (let i = 0; i < 3; i++) await assert.rejects(model.extract(source), { message: 'invalid_model_output' })
})

test('maps upstream failures to a safe retryable reason', async (t) => {
  const model = await fixture(t, (_req, res) => {
    res.writeHead(503)
    res.end('private diagnostic text')
  })
  await assert.rejects(model.extract(source), { message: 'model_unavailable' })
})
