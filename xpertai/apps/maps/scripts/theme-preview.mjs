import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startRemoteViewPreview } from '../../../../tools/remote-view-preview/preview-host.mjs'
import config from '../src/lib/remote-components/maps-workbench/preview.config.mjs'
import { startPreview } from './preview-server.mjs'

const json = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const lightTokens = {
  colorBackground: '#fffaf0', colorForeground: '#342f24', colorCard: '#fffaf0', colorCardForeground: '#342f24',
  colorPopover: '#fff5de', colorPopoverForeground: '#342f24', colorPrimary: '#137e68', colorPrimaryForeground: '#ffffff',
  colorSecondary: '#f2e9da', colorSecondaryForeground: '#342f24', colorMuted: '#f2e9da', colorMutedForeground: '#766954',
  colorAccent: '#e7eddc', colorAccentForeground: '#224632', colorBorder: '#c58a3a', colorInput: '#9d50b8', colorRing: '#147eaa',
  fontFamily: 'Georgia, "Songti SC", serif', densityRootFontSize: '16px', fontSizeSm: '13px', fontSizeMd: '14px', fontSizeControl: '12px', fontSizeButton: '14px',
  controlHeight: '30px', buttonHeight: '34px', buttonHeightSm: '26px',
  radiusSm: '2px', radiusMd: '4px', radiusLg: '8px'
}
const darkTokens = {
  colorBackground: '#101b29', colorForeground: '#eef5ff', colorCard: '#16273a', colorCardForeground: '#eef5ff',
  colorPopover: '#1b3049', colorPopoverForeground: '#eef5ff', colorPrimary: '#edc16b', colorPrimaryForeground: '#122030',
  colorSecondary: '#243b54', colorSecondaryForeground: '#eef5ff', colorMuted: '#243b54', colorMutedForeground: '#acc3db',
  colorAccent: '#3b4559', colorAccentForeground: '#f8dfaf', colorBorder: '#5177a6', colorInput: '#75a8d4', colorRing: '#e69b67',
  fontFamily: 'Arial, "PingFang SC", sans-serif', densityRootFontSize: '18px', fontSizeSm: '15px', fontSizeMd: '16px', fontSizeControl: '17px', fontSizeButton: '18px',
  controlHeight: '40px', buttonHeight: '44px', buttonHeightSm: '36px',
  radiusSm: '12px', radiusMd: '20px', radiusLg: '24px'
}
const remoteProfiles = {
  light: { mode: 'light', density: 'default', tokens: lightTokens },
  dark: { mode: 'dark', density: 'default', tokens: darkTokens },
  compact: { mode: 'light', density: 'compact', tokens: { ...lightTokens, densityRootFontSize: '14px', fontSizeSm: '12px', fontSizeMd: '13px', fontSizeControl: '12px', fontSizeButton: '11px', controlHeight: '1.75rem', buttonHeight: '1.75rem', buttonHeightSm: '1.5rem' } },
  reset: { mode: 'light', density: 'default', tokens: {} }
}
const standardKeys = {
  '--color-background-primary': 'colorBackground', '--color-text-primary': 'colorForeground',
  '--color-background-secondary': 'colorCard', '--color-background-tertiary': 'colorMuted', '--color-text-secondary': 'colorMutedForeground',
  '--color-background-inverse': 'colorPrimary', '--color-text-inverse': 'colorPrimaryForeground',
  '--color-border-primary': 'colorBorder', '--color-ring-primary': 'colorRing',
  '--font-sans': 'fontFamily', '--font-text-md-size': 'densityRootFontSize', '--font-text-sm-size': 'fontSizeSm',
  '--border-radius-sm': 'radiusSm', '--border-radius-md': 'radiusMd', '--border-radius-lg': 'radiusLg'
}
const mcpProfiles = Object.fromEntries(Object.entries(remoteProfiles).map(([key, profile]) => [key, {
  theme: profile.mode,
  styles: { variables: Object.fromEntries(Object.entries(standardKeys).flatMap(([standard, token]) => profile.tokens[token] ? [[standard, profile.tokens[token]]] : [])) }
}]))

function controls(surface) {
  return `<style>
    .theme-controls{box-sizing:border-box;position:sticky;top:0;z-index:100;background:#fff;color:#202126;border-bottom:1px solid #cbd0d6;padding:9px 14px;font:13px system-ui;display:flex;align-items:center;flex-wrap:wrap;gap:7px}
    .theme-controls a{color:#2258b1;margin-right:8px}.theme-controls button{padding:6px 10px;border:1px solid #bac2cc;border-radius:6px;background:#f7f9fb;color:#202126;cursor:pointer}
    .theme-controls button[aria-pressed=true]{background:#22374e;color:white}.theme-controls output{font-size:12px;color:#596575;flex-basis:100%}
    #remote-view{height:calc(100vh - 87px)!important}.host{max-width:none!important;margin:0!important;padding:0!important}.host>header{display:none}.host>iframe{height:calc(100vh - 87px)!important}
  </style><section class="theme-controls" aria-label="地图主题模拟宿主控制台">
    <strong>地图主题验收 · ${surface === 'workbench' ? 'Workbench' : 'MCP App'}</strong>
    <a href="/workbench">Workbench</a><a href="/mcp">MCP App</a>
    <button type="button" data-theme-profile="light" aria-pressed="true">浅色 · 方角 · 衬线字体</button>
    <button type="button" data-theme-profile="dark" aria-pressed="false">深色 · 大圆角 · 大字号</button>
    <button type="button" data-theme-profile="compact" aria-pressed="false">紧凑</button>
    ${surface === 'workbench' ? '<button type="button" id="density-only">仅紧凑密度</button>' : ''}
    <button type="button" data-theme-profile="reset" aria-pressed="false">撤销全部主题 Token</button>
    ${surface === 'mcp' ? '<button type="button" id="mcp-size-only">仅尺寸通知</button>' : ''}
    <output id="theme-status">真实 dist · 模拟地图数据 · 当前：浅色主题</output>
  </section>`
}

function controlScript(surface) {
  return `<script>
    (()=>{
      const surface=${json(surface)}, profiles=${json(surface === 'workbench' ? remoteProfiles : mcpProfiles)};
      const preview=window.mapsThemePreview={surface,active:'light',sent:[],profiles};
      const status=document.getElementById('theme-status');
      for(const button of document.querySelectorAll('[data-theme-profile]'))button.addEventListener('click',()=>{
        const key=button.dataset.themeProfile, profile=profiles[key];
        if(surface==='workbench')window.XpertRemoteViewPreview.updateContext({theme:profile});else window.mapsHost.setContext(profile);
        preview.active=key;preview.sent.push({type:'theme',key,profile});
        for(const item of document.querySelectorAll('[data-theme-profile]'))item.setAttribute('aria-pressed',String(item===button));
        status.textContent='真实 dist · 模拟地图数据 · 已发送 '+key+' 主题（结果与选择应保留）';
      });
      document.getElementById('mcp-size-only')?.addEventListener('click',()=>{
        const patch={containerDimensions:{width:640,height:720}};
        window.mapsHost.setContext(patch);preview.sent.push({type:'size-only',patch});
        status.textContent='已仅发送 containerDimensions；当前 '+preview.active+' 主题与地图状态应保持';
      });
      document.getElementById('density-only')?.addEventListener('click',()=>{
        const theme={mode:'light',density:'compact',tokens:{}};
        window.XpertRemoteViewPreview.updateContext({theme});preview.active='density-only';preview.sent.push({type:'theme',key:'density-only',profile:theme});
        for(const item of document.querySelectorAll('[data-theme-profile]'))item.setAttribute('aria-pressed','false');
        status.textContent='已仅发送紧凑密度，未传任何 Token；根字号应为 14px，地图状态应保持';
      });
    })();
  </script>`
}

/** Serves existing production bundles through the existing mock protocols. */
export async function startThemePreview({ port = 4388 } = {}) {
  const remote = await startRemoteViewPreview({ ...config, hostContext: { ...config.hostContext, theme: remoteProfiles.light } }, { port: 0, host: '127.0.0.1' })
  let mcp, server
  try {
    mcp = await startPreview({ port: 0, initialQuery: '咖啡馆', initialHostContext: mcpProfiles.light })
    server = createServer(async (request, response) => {
      try {
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
        if (path === '/') { response.writeHead(302, { location: '/workbench' }); response.end(); return }
        const surface = path === '/workbench' ? 'workbench' : path === '/mcp' ? 'mcp' : null
        const upstream = surface === 'workbench' || path.startsWith('/__xpert/') ? remote.url : mcp.url
        if (!surface && !path.startsWith('/__xpert/') && !['/app', '/rpc', '/favicon.ico'].includes(path)) { response.writeHead(404); response.end('Not found'); return }
        const chunks = []
        for await (const chunk of request) { chunks.push(chunk); if (chunks.reduce((size, value) => size + value.length, 0) > 65536) { response.writeHead(413); response.end(); return } }
        const result = await fetch(new URL(surface ? '/' : request.url, upstream), {
          method: request.method, headers: { 'content-type': request.headers['content-type'] ?? 'application/json' },
          ...(['POST', 'PUT'].includes(request.method) ? { body: Buffer.concat(chunks) } : {})
        })
        response.writeHead(result.status, { 'content-type': result.headers.get('content-type') ?? 'text/plain', 'cache-control': 'no-store', ...(result.headers.has('content-security-policy') ? { 'content-security-policy': result.headers.get('content-security-policy') } : {}) })
        if (surface) {
          const html = await result.text()
          response.end(html.replace('<body>', `<body>${controls(surface)}`).replace('</body>', `${controlScript(surface)}</body>`))
        } else response.end(Buffer.from(await result.arrayBuffer()))
      } catch { response.writeHead(502); response.end('Theme preview upstream unavailable') }
    })
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveListen) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Theme preview did not bind')
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: async () => { await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())); await Promise.all([remote.close(), mcp.close()]) }
    }
  } catch (error) { await Promise.all([remote.close(), mcp?.close()]); throw error }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const preview = await startThemePreview({ port: Number(process.env.MAPS_THEME_PREVIEW_PORT ?? 4388) })
  process.stdout.write(`Maps theme preview: ${preview.url}/workbench and ${preview.url}/mcp\n`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void preview.close().then(() => process.exit(0)) })
}
