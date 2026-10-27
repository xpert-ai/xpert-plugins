import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ClaudeCodeRuntimeStrategy, ClaudeSdkLoader } from '../dist/lib/claude.strategy.js'
import { ProcessRuntime } from '../dist/lib/process-runtime.js'
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'
import { directTarget, directCapabilities } from './managed-fixture.mjs'

// Real pinned SDK transport, controlled CLI protocol; no model/network credentials or paid calls.
test('installed Claude SDK uses the supervised spawn hook and cannot settle from its result message alone', async (t) => {
  const sdk = await new ClaudeSdkLoader().load()
  const root = await mkdtemp(join(tmpdir(), 'claude-sdk-supervision-'))
  const workspaceId = randomUUID(),
    invocationId = randomUUID()
  const snapshots = []
  let spawns = 0
  const profiles = new ProcessRuntime(new RuntimeProfiles())
  const source = `const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.type==='control_request') console.log(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:m.request_id,response:{commands:[],models:[],account:{}}}}));if(m.type==='user'){console.log(JSON.stringify({type:'system',subtype:'init',session_id:'fixture-session'}));console.log(JSON.stringify({type:'result',subtype:'success',session_id:'fixture-session',result:'sdk transport result',is_error:false,num_turns:1,total_cost_usd:0,duration_ms:1,duration_api_ms:1,usage:{},uuid:'fixture'}));}})`
  const strategy = new ClaudeCodeRuntimeStrategy(profiles, {
    load: async () => ({
      query: (input) =>
        sdk.query({
          ...input,
          options: {
            ...input.options,
            pathToClaudeCodeExecutable: process.execPath,
            spawnClaudeCodeProcess: (options) => {
              spawns++
              return input.options.spawnClaudeCodeProcess({
                ...options,
                command: process.execPath,
                args: ['-e', source]
              })
            }
          }
        })
    })
  })
  t.after(async () => {
    strategy.onModuleDestroy()
    profiles.onModuleDestroy()
    await rm(root, { recursive: true, force: true })
  })
  const context = {
    invocationId,
    capabilities: directCapabilities('claude-code', workspaceId, root, { timeoutMs: 5000 }),
    scope: { workspaceId },
    executionTarget: { version: 1, kind: 'host', hostId: randomUUID(), generation: randomUUID() },
    checkpoint: async (value) => snapshots.push(structuredClone(value))
  }
  await strategy.start(
    {
      target: directTarget('claude-code'),
      input: { prompt: 'protocol-only fixture' }
    },
    context
  )
  for (
    let i = 0;
    i < 800 &&
    !snapshots.some(
      (value) => value.result && (process.platform === 'linux' ? value.controlEvidence : value.status === 'unknown')
    );
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(spawns, 1)
  const done = snapshots.find(
    (value) => value.result && (process.platform === 'linux' ? value.controlEvidence : value.status === 'unknown')
  )
  assert.equal(done?.result.text, 'sdk transport result')
  assert.equal(done.status, process.platform === 'linux' ? 'succeeded' : 'unknown')
  assert.equal(Boolean(done.controlEvidence), process.platform === 'linux')
})
