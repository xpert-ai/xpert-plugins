import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requireFromHere = createRequire(import.meta.url)
const componentRoot = join(packageRoot, 'src', 'lib', 'remote-components', 'canvas-workbench')
const [appScript, appCss, react, reactDom] = await Promise.all([
  readFile(join(componentRoot, 'app.js'), 'utf8'),
  readFile(join(componentRoot, 'app.css'), 'utf8'),
  readPackageFile('react', 'umd/react.production.min.js'),
  readPackageFile('react-dom', 'umd/react-dom.production.min.js')
])

const port = Number(process.env.CANVAS_SHARE_HARNESS_PORT || 4178)
const instanceId = 'canvas-share-harness'
const snapshot = {
  store: {},
  schema: {
    schemaVersion: 2,
    sequences: {
      'com.tldraw.store': 5, 'com.tldraw.asset': 1, 'com.tldraw.camera': 1, 'com.tldraw.document': 2,
      'com.tldraw.instance': 26, 'com.tldraw.instance_page_state': 5, 'com.tldraw.page': 1,
      'com.tldraw.instance_presence': 6, 'com.tldraw.pointer': 1, 'com.tldraw.shape': 4,
      'com.tldraw.user': 1, 'com.tldraw.asset.image': 6, 'com.tldraw.asset.video': 5,
      'com.tldraw.asset.bookmark': 2, 'com.tldraw.shape.arrow': 8, 'com.tldraw.shape.bookmark': 2,
      'com.tldraw.shape.draw': 4, 'com.tldraw.shape.embed': 4, 'com.tldraw.shape.frame': 1,
      'com.tldraw.shape.geo': 11, 'com.tldraw.shape.group': 0, 'com.tldraw.shape.highlight': 3,
      'com.tldraw.shape.image': 5, 'com.tldraw.shape.line': 5, 'com.tldraw.shape.note': 12,
      'com.tldraw.shape.text': 4, 'com.tldraw.shape.video': 4, 'com.tldraw.binding.arrow': 1
    }
  }
}

const documentItem = {
  id: 'canvas-harness-1',
  title: '离线优先 Agent 工作流架构图',
  kind: 'canvas',
  status: 'draft',
  currentVersionId: 'canvas-version-3',
  currentVersionNumber: 3,
  workingCopyRevision: 5,
  snapshotChecksum: 'harness-checksum'
}

const detail = {
  item: documentItem,
  currentVersion: { id: 'canvas-version-3', versionNumber: 3, sourceType: 'workbench', changeSummary: '架构评审里程碑' },
  workingCopy: { snapshot, viewState: {}, selectionSummary: {}, workingCopyRevision: 5, snapshotChecksum: 'harness-checksum' },
  workingCopyRevision: 5,
  snapshotChecksum: 'harness-checksum',
  versions: [
    { id: 'canvas-version-3', versionNumber: 3, sourceType: 'workbench', changeSummary: '架构评审里程碑' },
    { id: 'canvas-version-2', versionNumber: 2, sourceType: 'workbench', changeSummary: '补充同步与失败处理' }
  ],
  logs: [{ id: 'log-1', action: 'artifact_published', message: 'Published Canvas read-only Artifact.' }],
  sceneSource: 'autosave',
  artifactShare: {
    artifactId: 'artifact-1', artifactVersionId: 'artifact-version-1', artifactLinkId: 'artifact-link-1',
    shareUrl: '/artifacts/share/canvas-harness', publicUrl: '/artifacts/share/canvas-harness',
    accessMode: 'public_link', versionMode: 'version', revision: 5, snapshotChecksum: 'harness-checksum'
  }
}

const server = createServer((request, response) => {
  if (request.url === '/remote') return sendHtml(response, remoteHtml())
  if (request.url === '/artifacts/share/canvas-harness') return sendHtml(response, '<!doctype html><title>Canvas Artifact</title><h1>Canvas Artifact share harness</h1>')
  return sendHtml(response, hostHtml())
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Canvas Workbench share harness: http://127.0.0.1:${port}`)
})

function hostHtml() {
  const viewData = JSON.stringify({
    documents: { items: [documentItem], total: 1, page: 1, pageSize: 20 },
    table: { items: [documentItem], total: 1, page: 1, pageSize: 20 },
    detail,
    settings: { artifactSharingAvailable: true }
  }).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canvas share harness</title><style>html,body{height:100%;margin:0;background:#eef1f4}iframe{display:block;width:100%;height:100%;border:0}.host-toast{position:fixed;left:16px;bottom:16px;z-index:20;max-width:420px;padding:9px 12px;border-radius:8px;background:#111827;color:#fff;font:12px system-ui;opacity:0;transition:opacity .15s}.host-toast.visible{opacity:1}</style></head><body><iframe id="canvas" src="/remote"></iframe><div id="toast" class="host-toast"></div><script>
const channel='xpertai.remote_component',protocolVersion=1,instanceId=${JSON.stringify(instanceId)},viewData=${viewData};
const frame=document.getElementById('canvas'),toast=document.getElementById('toast');let exportPolls=0;
function reply(source,message,data,type='response'){source.postMessage({channel,protocolVersion,instanceId,type,requestId:message.requestId,data},'*')}
window.addEventListener('message',event=>{const message=event.data||{};if(message.channel!==channel)return;if(message.type==='ready'){event.source.postMessage({channel,protocolVersion,instanceId,type:'init',locale:'zh-CN',theme:{mode:'light'},manifest:{key:'canvas_workbench'},initialQuery:{parameters:{documentId:'canvas-harness-1'}}},'*');return}if(message.type==='requestData'){reply(event.source,message,viewData);return}if(message.type==='executeAction'){if(message.actionKey==='open_document'){reply(event.source,message,{...viewData.detail,collab:{sessionId:'session-1',clientKey:'client-1',documentId:'collab-1',namespace:'/collaboration',connectionUrl:'http://127.0.0.1:${port}',access:'write',expiresAt:Date.now()+60000,canvasDocumentId:'canvas-harness-1',actor:{presenceId:'user-1',actorType:'user',displayName:'测试用户',color:'#0f766e',avatarUrl:null}}});return}if(message.actionKey==='publish_artifact'){exportPolls=0;reply(event.source,message,{exportId:'export-harness-1',documentId:'canvas-harness-1',status:'queued',stage:'queued'});return}if(message.actionKey==='get_artifact_export'){exportPolls+=1;reply(event.source,message,exportPolls<2?{exportId:'export-harness-1',status:'running',stage:'sandbox-rendering'}:{exportId:'export-harness-1',status:'succeeded',stage:'complete',share:viewData.detail.artifactShare});return}if(message.actionKey==='revoke_artifact_share'){viewData.detail.artifactShare=null;reply(event.source,message,{documentId:'canvas-harness-1',revoked:true});return}reply(event.source,message,{});return}if(message.type==='executeFileAction'){reply(event.source,message,{});return}if(message.type==='invokeClientCommand'){reply(event.source,message,{});return}if(message.type==='notify'){toast.textContent=message.message||'';toast.classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.classList.remove('visible'),1800)}});
</script></body></html>`
}

function remoteHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${appCss.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${react.replace(/<\/script/gi, '<\\/script')}</script><script>${reactDom.replace(/<\/script/gi, '<\\/script')}</script><script>${appScript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}

function sendHtml(response, html) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  response.end(html)
}

async function readPackageFile(packageName, relativePath) {
  const packageDir = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageDir, relativePath), 'utf8')
}
