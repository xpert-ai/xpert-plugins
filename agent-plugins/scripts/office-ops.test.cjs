const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '../assistants/office-ops')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'))
const dsl = JSON.parse(fs.readFileSync(path.join(root, manifest.extensions.xpertai.templates[0].path), 'utf8'))
test('template points to all seven packaged playbooks and a connected file middleware', () => {
  const skills = dsl.template.dependencies.skills
  assert.equal(skills.length,7)
  for (const skill of skills) { assert.deepEqual(skill.source,{kind:'agent-plugin',name:manifest.name}); assert.equal(skill.pluginName,undefined); assert.equal(skill.targetAgentKey,dsl.team.agent.key); assert(fs.existsSync(path.join(root,'skills',skill.componentKey,'SKILL.md'))) }
  assert(dsl.connections.every(edge=>dsl.nodes.some(node=>node.key===edge.from)&&dsl.nodes.some(node=>node.key===edge.to)))
})
test('all routine keys are stable, unique, paused, and user-timezone based', () => {
  const routines = dsl.template.manifest.routines
  assert.equal(routines.length,3); assert.equal(new Set(routines.map(x=>x.key)).size,3)
  for (const routine of routines) { assert.equal(routine.enabled,false); assert.equal(routine.timezone,'user'); assert(dsl.template.dependencies.skills.some(skill=>skill.componentKey===routine.skill)) }
})
test('empty ledger seeds are user-isolated and never overwrite existing data', () => {
  const files = dsl.template.manifest.files
  assert.equal(files.scope,'user')
  const ledgers=files.entries.filter(file=>file.path.endsWith('.json'))
  assert.equal(ledgers.length,5)
  for(const file of files.entries) { assert.equal(file.policy,'create-only'); assert(!file.path.startsWith('/')); if(file.path.endsWith('.json')) assert.deepEqual(JSON.parse(file.content),{schemaVersion:1,items:[]}) }
})
test('external actions default to approval; connector credentials are absent', () => {
  assert.equal(dsl.team.options.operationPolicy.default,'approve')
  assert(!JSON.stringify(dsl).includes('connectorId'))
  assert.equal(dsl.template.manifest.execution.offline,'requires-online')
  const sync=fs.readFileSync(path.join(root,'skills/office-sync/SKILL.md'),'utf8')
  assert(sync.includes('NOT SYNCED')); assert(sync.includes('ambiguous timeout')); assert(sync.includes('must not repeat'))
})
test('celebrations excludes opt-outs and birth years, and new-hire reruns preserve completion',()=>{
  const text=fs.readFileSync(path.join(root,'skills/office-celebrations/SKILL.md'),'utf8')
  assert(text.includes('never birth year')); assert(text.includes('optOut true')); assert(text.includes('year boundaries'))
  assert(fs.readFileSync(path.join(root,'skills/office-new-hire/SKILL.md'),'utf8').includes('Preserve completed'))
})

test('bundle version matches the loaded plugin and existing ledgers can be edited', () => {
  assert.equal(manifest.extensions.xpertai.version,2)
  assert(!fs.existsSync(path.join(root,'package.json')))
  assert.equal(manifest.version,dsl.template.manifest.version)
  const files=dsl.nodes.find(node=>node.type==='workflow' && node.entity.provider==='SandboxFile')
  assert.equal(files.entity.tools.sandbox_edit_file, true)
  assert(dsl.team.options.operationPolicy.rules.some(rule=>rule.tool==='sandbox_edit_file' && rule.decision==='allow'))
})
