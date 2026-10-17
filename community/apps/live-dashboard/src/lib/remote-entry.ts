import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'

export async function dashboardRemoteEntry(readOnly = false) {
  const [appScript, appCss, renderer] = await Promise.all([readFile(join(__dirname, '../remote/app.js'), 'utf8'), readFile(join(__dirname, '../remote/app.css'), 'utf8'), readFile(join(__dirname, '../remote/renderer.html'), 'utf8')])
  return { html: renderRemoteReactIframeHtml({ title: 'Live dashboards', reactUmd: '', reactDomUmd: '',
    appScript: `window.__DASHBOARD_READ_ONLY__=${readOnly};window.__ANALYTICS_RENDERER_HTML__=${JSON.stringify(renderer).replace(/</g, '\\u003c')};\n${appScript}`, appCss }),
    contentType: 'text/html; charset=utf-8' as const }
}
