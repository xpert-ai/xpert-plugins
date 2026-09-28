const frame = document.querySelector('iframe')
const instanceId = crypto.randomUUID()
function send(type, body = {}) { frame.contentWindow.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, type, ...body }, '*') }
const palettes = {
 light: { colorBackground: '#ffffff', colorForeground: '#242424', colorMuted: '#f5f5f5', colorMutedForeground: '#666666', colorBorder: '#e5e5e5', colorPrimary: '#333333', colorPrimaryForeground: '#ffffff' },
 dark: { colorBackground: '#191919', colorForeground: '#eeeeee', colorMuted: '#262626', colorMutedForeground: '#aaaaaa', colorBorder: '#3d3d3d', colorPrimary: '#eeeeee', colorPrimaryForeground: '#191919' }
}
function init() { const mode = document.querySelector('#theme').value; send('init', { locale: document.querySelector('#locale').value, theme: { mode, density: 'default', tokens: palettes[mode] }, initialQuery: { selectionId: new URL(location.href).searchParams.get('selectionId') || undefined }, debug: { enabled: false, production: false } }) }
document.querySelector('#theme').addEventListener('change', init)
document.querySelector('#locale').addEventListener('change', init)
document.querySelector('#failure').addEventListener('click', async () => { const r = await fetch('/api/test/fail-next', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (r.ok) document.querySelector('#failure').textContent = '已安排一次模拟失败' })
window.addEventListener('message', async event => {
 if (event.source !== frame.contentWindow) return
 const m = event.data
 if (!m || m.channel !== 'xpertai.remote_component' || m.protocolVersion !== 1) return
 if (m.type === 'ready') { init(); return }
 if (m.instanceId !== instanceId) return
 try {
  if (m.type === 'requestData' || m.type === 'executeAction') {
   const body = m.type === 'requestData' ? m.query : { actionKey: m.actionKey, targetId: m.targetId, input: m.input }
   const r = await fetch(m.type === 'requestData' ? '/api/query' : '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
   if (!r.ok) throw Error('request_failed')
   const result = await r.json()
   if (m.type === 'requestData' && m.query?.selectionId) { const u = new URL(location.href); u.searchParams.set('selectionId', m.query.selectionId); history.replaceState({}, '', u) }
   send(m.type === 'requestData' ? 'data' : 'actionResult', { requestId: m.requestId, data: result })
  }
 } catch { send('error', { requestId: m.requestId, message: 'operation_failed' }) }
})
