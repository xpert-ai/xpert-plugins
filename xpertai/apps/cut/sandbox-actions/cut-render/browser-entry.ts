import { canExportCutMp4, exportCutMp4 } from '../../src/lib/remote-components/cut-workbench/src/cut-exporter'
import type { CutDocument } from '../../src/lib/remote-components/cut-workbench/src/cut-types'

declare global {
  interface Window {
    __cutRenderState?: {
      state: 'idle' | 'rendering' | 'completed' | 'failed'
      progress: number
      error?: string
    }
  }
}

window.__cutRenderState = { state: 'idle', progress: 0 }
void render().catch((error) => {
  window.__cutRenderState = {
    state: 'failed',
    progress: window.__cutRenderState?.progress ?? 0,
    error: error instanceof Error ? error.message : String(error)
  }
})

async function render() {
  window.__cutRenderState = { state: 'rendering', progress: 0 }
  const response = await fetch('/request.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Render request could not be loaded (${response.status}).`)
  const request = await response.json() as { payload: { document: CutDocument } }
  const projectDocument = request.payload.document
  if (!(await canExportCutMp4(projectDocument.settings.width, projectDocument.settings.height))) {
    throw new Error('H.264 encoding is unavailable in the Browser Runtime.')
  }
  const canvas = document.createElement('canvas')
  canvas.hidden = true
  document.body.append(canvas)
  const blob = await exportCutMp4(canvas, projectDocument, (progress) => {
    window.__cutRenderState = { state: 'rendering', progress }
  })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = 'cut.mp4'
  document.body.append(anchor)
  anchor.click()
  window.__cutRenderState = { state: 'completed', progress: 1 }
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}
