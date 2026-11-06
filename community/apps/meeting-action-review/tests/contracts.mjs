import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { getMetadataArgsStorage } from 'typeorm'
import { describeXpertToolProvider } from '@xpert-ai/plugin-sdk'
import plugin from '../dist/index.js'
import { MeetingTools, toolScope } from '../dist/lib/meeting-tools.js'
import { MeetingViewProvider } from '../dist/lib/meeting-view.provider.js'
import { MeetingRecord, AnalysisAttempt } from '../dist/lib/entities.js'
import { FEATURE, SOURCE_TOOL, SUBMIT_TOOL, NAMESPACE } from '../dist/lib/constants.js'
test('runtime metadata, two namespaced entities, feature-gated View and exactly two non-MCP tools',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  assert.equal(plugin.meta.version,pkg.version);assert.equal(plugin.meta.level,pkg.xpert.plugin.level)
  assert.equal(plugin.meta.artifactNamespace,pkg.xpert.plugin.artifactNamespace);assert.equal(plugin.meta.artifactNamespace,NAMESPACE)
  const tables=getMetadataArgsStorage().tables.filter(t=>[MeetingRecord,AnalysisAttempt].includes(t.target))
  assert.equal(tables.length,2);assert.ok(tables.every(t=>t.name.startsWith(`plugin_${NAMESPACE}_`)))
  const descriptor=describeXpertToolProvider(new MeetingTools(null))
  assert.deepEqual(descriptor.tools.map(t=>t.options.name).sort(),[SOURCE_TOOL,SUBMIT_TOOL].sort())
  assert.ok(descriptor.tools.every(t=>t.options.mcp===false))
  const view=new MeetingViewProvider(null,null)
  const manifests=view.getViewManifests({hostType:'agent'},'agent.workbench.fixed')
  assert.equal(manifests.length,1);assert.deepEqual(manifests[0].activation.requiredFeatures,[FEATURE])
  assert.equal(manifests[0].dataSource.querySchema.supportsPagination,true)
  assert.equal(manifests[0].dataSource.querySchema.defaultPageSize,20)
  assert.equal(manifests[0].dataSource.cache.enabled,false)
  assert.deepEqual(manifests[0].clientCommands.map(c=>c.key),['workbench.navigation.open'])
  assert.equal(pkg.exports['.'].default,'./dist/index.js')
  assert.deepEqual(manifests[0].actions.map(a=>a.key),['create_analysis','retry_analysis','save_draft','confirm'])
  assert.equal(view.getViewManifests({hostType:'agent'},'wrong.slot').length,0)
  assert.throws(()=>toolScope({surface:'mcp',principal:{}}),/NO_ACTIVE_CONTEXT/)
})
test('human mutations notify the host to invalidate any existing View snapshots',async()=>{
  const id='00000000-0000-4000-8000-000000000001'
  const records={save:async()=>({id}),dto:async()=>({id,status:'review_ready'})}
  const view=new MeetingViewProvider(records,null)
  const result=await view.executeViewAction({tenantId:id,organizationId:id,userId:id,assistant:{instanceId:id}},'meeting_action_review.workbench','save_draft',
    {input:{meetingId:id,operationId:'00000000-0000-4000-8000-000000000002',expectedRevision:2,items:[]}})
  assert.equal(result.success,true);assert.equal(result.refresh,true)
})
test('Assistant template has one primary agent, bounded graph, no sandbox, and no human confirmation tool',async()=>{
  const template=parse(plugin.templates[0].dslContent)
  assert.equal(template.nodes.filter(n=>n.type==='agent').length,1)
  assert.equal(template.team.features.sandbox.enabled,false)
  assert.equal(template.team.agentConfig.recursionLimit,20)
  assert.equal(template.nodes.filter(n=>n.entity?.type==='middleware').length,1)
  assert.ok(template.nodes[0].entity.prompt.includes(SOURCE_TOOL))
  assert.ok(template.nodes[0].entity.prompt.includes(SUBMIT_TOOL))
})
