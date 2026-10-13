const plugin = new URLSearchParams(location.search).get('plugin') === 'review' ? 'review' : 'sites'
const channel = 'xpertai.remote_component', instanceId = 'acceptance-' + plugin
const frame = document.querySelector('#view'), receipt = document.querySelector('#receipt')
const projectId = '11111111-1111-4111-8111-111111111111', versionId = '22222222-2222-4222-8222-222222222222'
const now = '2026-10-12T00:00:00Z'
const viewKey = plugin === 'sites' ? 'sites__sites_workbench' : 'code_review.provider__code_review.workspace'
const initial = {
  project: { id: projectId, name: '验收示例站点', slug: 'fixture', status: 'draft', audience: 'admins_only', updatedAt: now, latestVersionId: versionId, latestVersionNumber: 1 },
  versions: [{ id: versionId, versionNumber: 1, title: '可预览草稿', createdAt: now }], deployments: [], environmentValues: [],
  review: { id: projectId, revision: 1, ref: { provider: 'github', owner: 'example', repository: 'fixture', number: 1 }, snapshot: { title: '修复空值读取', body: 'Deterministic acceptance fixture', url: 'https://github.com/example/fixture/pull/1', state: 'open', author: 'fixture', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), files: [{ filename: 'src/read.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-return value.name\n+return value.name.trim()' }], comments: [], checks: [{ id: 1, name: 'unit', status: 'completed', conclusion: 'success', url: null }], warnings: [], fetchedAt: now }, status: 'reviewed', access: 'public', pinned: false, viewed: [], summary: '发现一个可复现的空值问题。', findings: [{ title: '处理空值后再调用 trim', body: '当 value.name 为 null 时当前调用会抛出 TypeError。请在调用前验证类型。', priority: 'P1', path: 'src/read.ts', side: 'RIGHT', line: 1 }], errorCode: null, submissionUrl: null }
}
let state = JSON.parse(sessionStorage.getItem('acceptance:' + plugin) ?? 'null') ?? { domain: initial, query: {}, actions: [], commands: [], errors: [] }
state.domain.automation ??= {
  repositories: [{ id: versionId, owner: 'example', repository: 'fixture', revision: 1, lastEventAt: now, errorCode: null,
    settings: { enabled: false, delivery: 'draft', onOpened: true, onReady: true, onPush: true, includeBots: false,
      branches: ['develop'], ignoredPaths: ['**/pnpm-lock.yaml'], instructions: '', dailyLimit: 20, visibility: 'private' } }],
  runs: [{ id: '33333333-3333-4333-8333-333333333333', repositoryPolicyId: versionId, title: '本地验收：修复空值读取', number: 1,
    headSha: 'b'.repeat(40), trigger: 'opened', status: 'awaiting_confirmation', reason: null, reviewId: projectId, policyRevision: 1, createdAt: now, publicationUrl: null }],
  total: 1, app: { configured: true, installUrl: 'https://github.com/apps/example/installations/new', webhookUrl: 'https://fixture.invalid/api/code_review/github/webhook' }
}
let revision = 0, deny = false
function save() {sessionStorage.setItem('acceptance:' + plugin, JSON.stringify(state));receipt.textContent = JSON.stringify({ query: state.query, actions: state.actions, commands: state.commands, errors: state.errors, versions: state.domain.versions.map(v=>v.versionNumber), deployedVersion: state.domain.deployments[0]?.versionId, viewed: state.domain.review.viewed }, null, 0)}
function post(type, payload={}) { frame.contentWindow.postMessage({channel,protocolVersion:1,type,instanceId,scopeRevision:revision,...payload},'*') }
function init() {post('init',{locale:'zh-Hans',manifest:{key:viewKey},runtimeScope:{projectId:null,conversationId:null},initialQuery:state.query,theme:{mode:'light'}})}
function mount() {frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${location.origin}/${plugin}/app.css"></head><body><div id="root"></div><script>window.addEventListener('error',e=>parent.postMessage({fixtureError:e.message},'*'));window.addEventListener('unhandledrejection',e=>parent.postMessage({fixtureError:String(e.reason)},'*'))</script><script src="${location.origin}/${plugin}/app.js"></script></body></html>`}
function data(query) {
 if (plugin==='review' && query.parameters?.automation) return {meta:state.domain.automation}
 if (plugin==='review') return query.selectionId ? {meta:{detail:state.domain.review}} : {items:[state.domain.review],total:1}
 if (query.parameters?.preview) return {meta:{previewHtml:'<!doctype html><h1>验收示例站点</h1><p>来自已保存的不可变版本</p><button onclick="this.textContent=\'已验证\'">验证交互</button>'}}
 return query.selectionId ? {meta:state.domain} : {items:[state.domain.project].filter(p=>!query.search||p.name.includes(query.search)),total:query.search&&!state.domain.project.name.includes(query.search)?0:1}
}
function mutate(key,input) {
 state.actions.push({key,input});
 if (deny) {deny=false;return {success:false,data:{code:'forbidden'}}}
 if (plugin==='review') {
   if(key==='repository.save') {
     if(input.confirmed!==true)throw Error('Missing policy confirmation')
     const repo=state.domain.automation.repositories.find(r=>r.id===input.id)
     if(!repo || repo.revision!==input.revision)return {success:false,data:{code:'revision_conflict'}}
     repo.settings=input.settings;repo.revision++;return {success:true,data:{id:repo.id}}
   }
   if(key==='repository.trial') { state.domain.automation.runs.unshift({...state.domain.automation.runs[0],id:crypto.randomUUID(),trigger:'trial',status:'queued',reviewId:null});state.domain.automation.total++;return {success:true,data:{queued:true}} }
   if(key==='run.confirm') {if(input.confirmed!==true)throw Error('Missing run confirmation');return {success:true,data:{fixtureOnly:true}}}
   if(key==='mark') {state.domain.review.viewed=input.viewed??state.domain.review.viewed;state.domain.review.pinned=input.pinned??state.domain.review.pinned;state.domain.review.revision++}
   if(key==='submit') throw Error('Fixture forbids external submissions')
   return {success:true,data:state.domain.review}
 }
 if(key==='restore_version') {const v={...state.domain.versions[0],id:crypto.randomUUID(),versionNumber:state.domain.versions.length+1,title:'恢复草稿'};state.domain.versions.unshift(v);return{success:true,data:v}}
 if(key==='deploy_version') {if(input.confirmed!==true)throw Error('Missing confirmation');state.domain.deployments.unshift({id:'deployment',versionId:input.versionId,status:'active',accessMode:input.accessMode});state.domain.project.currentDeploymentId='deployment';return{success:true,data:{deployed:true}}}
 if(key==='create_site') {state.domain.project.name=input.name;return{success:true,data:{projectId}}}
 return {success:false,data:{code:'unsupported_action'}}
}
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow)return
 const m=event.data
 if(m.fixtureError){state.errors.push(m.fixtureError);save();return}
 if(m.channel!==channel)return
 if(m.type==='ready'){init();return}
 try {
  if(m.type==='requestData') post('data',{requestId:m.requestId,data:data(m.query)})
  if(m.type==='executeAction') post('actionResult',{requestId:m.requestId,data:mutate(m.actionKey,m.input)})
  if(m.type==='invokeClientCommand') {
   state.commands.push(m.commandKey)
   if(m.commandKey==='workbench.navigation.open'){state.query={selectionId:m.payload.selectionId,parameters:m.payload.parameters}}
   post('clientCommandResult',{requestId:m.requestId,result:{success:true,data:{status:'opened'}}})
  }
 } catch(e) {state.errors.push(e.message);post('error',{requestId:m.requestId,code:'fixture_error'})}
 save()
})
document.querySelector('#reload').onclick=mount
document.querySelector('#deny').onclick=()=>{deny=true}
document.querySelector('#scope').onclick=()=>{revision++;post('hostEvent',{event:{type:'view.context.changed',data:{revision,runtimeScope:{projectId:null,conversationId:'changed'}}}})}
save();mount()
