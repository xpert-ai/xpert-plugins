import { Client } from '/Users/xpertai/Pro/xpert-pro/node_modules/@xpert-ai/xpert-sdk/dist/index.js'
import { HumanMessage, RemoveMessage } from '/Users/xpertai/Pro/xpert-pro/node_modules/@langchain/core/dist/messages/index.js'
import { REMOVE_ALL_MESSAGES } from '/Users/xpertai/Pro/xpert-pro/node_modules/@langchain/langgraph/dist/graph/message.js'
import {
  createRequestHeaders,
  resolveAuthentication
} from '/Users/xpertai/GitHub/os/xpert/tools/scripts/local-plugin-cli.mjs'

const apiOrigin = 'http://localhost:3000'
const authArgs = {
  apiUrl: apiOrigin,
  scope: 'organization',
  orgId: '5bdc8076-36cd-444a-9aa1-82ea0fa30496',
  tenantId: 'a3ed4e50-da8e-4b4b-aec1-87e1027ad3f1'
}
const authentication = await resolveAuthentication(authArgs)
const headers = createRequestHeaders(authArgs, authentication.token, authentication.tenantId)
delete headers['content-type']
const client = new Client({ apiUrl: `${apiOrigin}/api/ai`, defaultHeaders: headers, timeoutMs: 30_000 })

const threadId = '2da1887d-8a4d-40f0-a950-a1bed31296d1'
const runId = process.env.IMG2THREEJS_EXECUTION_ID ?? '660b0287-de82-4c2b-9764-241dd1bebf84'
const projectId = 'de2c1420-9ed5-4d2d-8219-68429a581bc1'

if (process.argv[2] === 'cancel') {
  await client.runs.cancel(threadId, runId, true)
  process.stdout.write(JSON.stringify({ cancelled: true, threadId, runId }) + '\n')
} else if (process.argv[2] === 'summary') {
  const response = await fetch(`${apiOrigin}/api/img2threejs/projects/${projectId}/summary`, { headers })
  if (!response.ok) throw new Error(`SUMMARY_HTTP_${response.status}`)
  process.stdout.write(JSON.stringify(await response.json()) + '\n')
} else if (process.argv[2] === 'state') {
  const state = await client.threads.getState(threadId)
  process.stdout.write(JSON.stringify(state) + '\n')
} else if (process.argv[2] === 'state-summary') {
  const state = await client.threads.getState(threadId)
  const values = state.values ?? {}
  const channels = Object.entries(values).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const messages = Array.isArray(value.messages) ? value.messages : []
    if (!messages.length && typeof value.summary !== 'string') return []
    return [{
      key,
      messageCount: messages.length,
      summaryLength: typeof value.summary === 'string' ? value.summary.length : 0,
      summary: typeof value.summary === 'string' ? value.summary.slice(0, 3000) : null,
      messageContents: messages.slice(-3).map((message) => String(message?.content ?? message?.lc_kwargs?.content ?? '').slice(0, 500))
    }]
  })
  process.stdout.write(JSON.stringify({ keys: Object.keys(values), channels }) + '\n')
} else if (process.argv[2] === 'models') {
  const response = await fetch(
    `${apiOrigin}/api/xpert/6e266458-7287-47c1-9cbb-40fdc9419061/model-catalog?type=llm`,
    { headers }
  )
  if (!response.ok) throw new Error(`MODELS_HTTP_${response.status}`)
  const value = await response.json()
  const entries = Array.isArray(value) ? value : value?.data ?? []
  process.stdout.write(JSON.stringify(entries) + '\n')
} else if (process.argv[2] === 'replace-context') {
  const context = [
    `Continue project ${projectId}: Doraemon House Assistant-only reconstruction.`,
    'The server owns all concurrency state; tool calls must use only their current public schemas.',
    'Current code and semantic Spec already exist. Your first tool call must be img2threejs_get_status, followed by the diagnostic tool named by nextAction.',
    'Only the current tool outputs are authoritative. All earlier discussion and visual notes were intentionally discarded because they described superseded candidates; never toggle implementations based on omitted history.',
    'Repair the Assistant-authored TypeScript through Workspace Files, submit it with the current public refine_code schema, then follow every returned nextAction through a fresh browser render and visual diagnosis.',
    'Do not send checksum, revision, baseRevision, runRevision, projectRevision, expectedRevision, or other concurrency fields.',
    'Do not read or adapt upstream repository source. The Assistant remains the only model-code author.'
  ].join('\n')
  await client.threads.updateState(threadId, {
    values: {
      agent_img2threejs_channel: {
        summary: '',
        messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), new HumanMessage(context)]
      }
    },
    asNode: 'Agent_Img2ThreeJs'
  })
  process.stdout.write(JSON.stringify({ replaced: true, threadId, projectId }) + '\n')
} else {
  const run = await client.runs.get(threadId, runId)
  process.stdout.write(JSON.stringify({
    threadId,
    runId,
    status: run.status,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    error: run.error ?? null
  }) + '\n')
}
