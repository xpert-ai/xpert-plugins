import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const root=resolve(import.meta.dirname,'..'),b=JSON.parse(await readFile(resolve(root,'blueprints/pipeline.v1.json'),'utf8'))
const nodes=new Map(b.nodes.map(n=>[n.key,n])),roles=new Set(b.roles.map(r=>r.key))
if(nodes.size!==b.nodes.length||roles.size!==8)throw Error('Duplicate nodes or missing role definitions')
if(b.views.filter(v=>v.kind==='operations_dashboard').length!==1||b.views.filter(v=>v.kind==='pipeline_overview').length!==1)throw Error('Exactly one dashboard and pipeline are required')
for(const edge of b.edges)if(!nodes.has(edge.from)||!nodes.has(edge.to))throw Error('Invalid edge')
for(const node of b.nodes)if(node.kind==='task'&&!roles.has(node.accountableRoleKey??node.laneKey))throw Error('Missing accountable role')
const visited=new Set(),active=new Set()
function walk(key){if(active.has(key))throw Error('DAG cycle');if(visited.has(key))return;active.add(key);for(const e of b.edges.filter(e=>e.from===key))walk(e.to);active.delete(key);visited.add(key)}
walk(b.pipeline.startNodeKey);if(visited.size!==nodes.size)throw Error('Unreachable nodes')
const source=await readFile(resolve(root,'src/lib/flow-definition.ts'),'utf8')
const literal=source.slice(source.indexOf('=')+1).replace(/as const\s*;?\s*$/,'').trim()
if(JSON.stringify(JSON.parse(literal))!==JSON.stringify(b))throw Error('Generated flow definition is stale')
console.log(`Blueprint verified: ${roles.size} roles, ${nodes.size} DAG nodes and ${b.views.length} views.`)
