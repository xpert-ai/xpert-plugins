import { cutExportProfile, normalizeCutExportSettings, type CutExportSettings } from '../../src/lib/cut-export-settings'
import { canExportCutVideo, exportCutVideo } from '../../src/lib/remote-components/cut-workbench/src/cut-exporter'
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
  const request = await response.json() as { payload: { document: CutDocument; exportSettings?: Partial<CutExportSettings> } }
  const projectDocument = request.payload.document
  const exportSettings = normalizeCutExportSettings(request.payload.exportSettings)
  const profile = cutExportProfile(exportSettings)
  if (!(await canExportCutVideo(exportSettings, projectDocument.settings.width, projectDocument.settings.height))) {
    throw new Error(`${profile.videoCodec.toUpperCase()}${exportSettings.includeAudio ? `/${profile.audioCodec.toUpperCase()}` : ''} encoding is unavailable in the Browser Runtime.`)
  }
  const canvas = document.createElement('canvas')
  canvas.hidden = true
  document.body.append(canvas)
  const blob = await exportCutVideo(canvas, projectDocument, exportSettings, (progress) => {
    window.__cutRenderState = { state: 'rendering', progress }
  })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `cut.${profile.extension}`
  document.body.append(anchor)
  anchor.click()
  window.__cutRenderState = { state: 'completed', progress: 1 }
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}
