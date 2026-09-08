import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps'
import { z } from 'zod/v3'
import { dictionary, type MessageKey } from './i18n'
import { drawingResultSchema, qualityResultSchema } from '../../src/lib/tools/result-schemas'
import { jobResultSchema } from '../../src/lib/rendering/render-contracts'
import { imageResultSchema } from '../../src/lib/tools/drawing-contracts'

const app = new App({ name: 'Excalidraw Preview', version: '0.14.2' }, {}, { autoResize: true })
let t = dictionary(),
  drawingId = '',
  revision = 0,
  version = 0,
  epoch = 0,
  scale = 1,
  x = 0,
  y = 0
const el = (id: string) => {
  const node = document.getElementById(id)
  if (!node) throw new Error('Missing UI element')
  return node
}
const image = el('image') as HTMLImageElement,
  viewport = el('viewport'),
  status = el('status'),
  details = el('details')
let previewMeta: z.infer<typeof imageResultSchema> | undefined
let statusKey: MessageKey = 'empty'
let qualityReport: { revision?: number; status: string; issues: { severity: string; message: string }[] } | undefined
function setStatus(key: MessageKey, state = '') {
  statusKey = key
  status.textContent = t[key]
  status.dataset.state = state
}
function renderDetails() {
  if (previewMeta) {
    const meta = previewMeta
    details.textContent = `${meta.kind === 'diagram_ir' ? t.ir : t.scene} ${
      meta.kind === 'diagram_ir' ? meta.irRevision : meta.sceneRevision
    } · ${t.version} ${version || t.unknown}`
    image.alt = `${t.title}: ${drawingId}`
  }
}
function renderQuality() {
  if (!qualityReport) return
  const panel = el('quality-panel')
  panel.replaceChildren()
  const heading = document.createElement('p')
  heading.textContent = `${t.ir} ${qualityReport.revision} · ${qualityReport.status}`
  panel.append(heading)
  for (const issue of qualityReport.issues) {
    const p = document.createElement('p')
    p.textContent = `${issue.severity}: ${issue.message}`
    panel.append(p)
  }
}
function translate() {
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n as MessageKey
    node.textContent = t[key]
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-label]'))
    node.setAttribute('aria-label', t[node.dataset.label as MessageKey])
  document.documentElement.lang = app.getHostContext()?.locale ?? 'en'
  status.textContent = t[statusKey]
  renderDetails()
  renderQuality()
}
function context() {
  const ctx = app.getHostContext()
  t = dictionary(ctx?.locale)
  if (ctx?.theme) applyDocumentTheme(ctx.theme)
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx?.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
  translate()
}
function transform() {
  image.style.transform = `translate(${x}px,${y}px) scale(${scale})`
  el('zoom').textContent = `${Math.round(scale * 100)}%`
}
function fit() {
  if (!image.naturalWidth) return
  scale = Math.min((viewport.clientWidth - 32) / image.naturalWidth, (viewport.clientHeight - 32) / image.naturalHeight)
  x = (viewport.clientWidth - image.naturalWidth * scale) / 2
  y = (viewport.clientHeight - image.naturalHeight * scale) / 2
  transform()
}
function zoom(factor: number, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
  const next = Math.max(0.05, Math.min(8, scale * factor))
  x = cx - ((cx - x) * next) / scale
  y = cy - ((cy - y) * next) / scale
  scale = next
  transform()
}
let drag: { id: number; x: number; y: number } | null = null
viewport.addEventListener('pointerdown', (event) => {
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  viewport.setPointerCapture(event.pointerId)
})
viewport.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return
  x += event.clientX - drag.x
  y += event.clientY - drag.y
  drag = { id: drag.id, x: event.clientX, y: event.clientY }
  transform()
})
viewport.addEventListener('pointerup', () => {
  drag = null
})
viewport.addEventListener('pointercancel', () => {
  drag = null
})
viewport.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const rect = viewport.getBoundingClientRect()
    zoom(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left, event.clientY - rect.top)
  },
  { passive: false }
)
el('fit').onclick = fit
el('in').onclick = () => zoom(1.25)
el('out').onclick = () => zoom(0.8)
viewport.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') zoom(1.25)
  else if (event.key === '-') zoom(0.8)
  else if (event.key === '0') fit()
})
class ResultUnavailableError extends Error {}
async function call(name: string, args: Record<string, string | number>) {
  const result = await app.callServerTool({ name, arguments: args })
  if (result.isError) throw new Error('tool_failed')
  if (result.structuredContent?.resultStatus === 'unavailable') throw new ResultUnavailableError()
  return result
}
async function show(id: string, token: number) {
  const result = await call('excalidraw_read_preview', { previewId: id })
  if (token !== epoch) return
  const meta = imageResultSchema.parse(result.structuredContent)
  const block = result.content.find((item) => item.type === 'image')
  if (!block || block.type !== 'image' || block.mimeType !== 'image/png') throw new Error('preview_missing')
  previewMeta = meta
  image.onload = fit
  image.src = `data:image/png;base64,${block.data}`
  image.hidden = false
  setStatus(meta.stale ? 'stale' : 'ready', meta.stale ? 'stale' : 'ready')
  renderDetails()
}
async function follow(initial: z.infer<typeof jobResultSchema>, token: number) {
  let job = initial
  while (!job.terminal && token === epoch) {
    setStatus('loading', 'loading')
    job = jobResultSchema.parse(
      (await call('excalidraw_wait_job', { jobId: job.jobId, cursor: job.cursor })).structuredContent
    )
  }
  if (token !== epoch) return
  if (job.status !== 'succeeded') {
    setStatus(job.status === 'cancelled' ? 'cancelled' : job.status === 'conflict' ? 'conflict' : 'failed', 'failed')
    return
  }
  if (job.previewId) await show(job.previewId, token)
  else await refresh()
}
async function readDrawing() {
  const value = drawingResultSchema.parse((await call('excalidraw_get_drawing', { drawingId })).structuredContent)
  revision = value.sceneRevision
  version = value.versionNumber
  el('drawing-title').textContent = value.title
}
async function refresh() {
  if (!drawingId) return
  const token = ++epoch
  setStatus('loading', 'loading')
  status.dataset.state = 'loading'
  try {
    await readDrawing()
    const job = jobResultSchema.parse(
      (
        await call('excalidraw_create_preview', {
          drawingId,
          expectedRevision: revision,
          operationId: crypto.randomUUID()
        })
      ).structuredContent
    )
    await follow(job, token)
  } catch (error) {
    if (token === epoch) {
      setStatus(error instanceof ResultUnavailableError ? 'incomplete' : 'failed', 'failed')
    }
  }
}
el('refresh').onclick = () => void refresh()
el('quality').onclick = async () => {
  const panel = el('quality-panel')
  panel.hidden = !panel.hidden
  if (panel.hidden || !drawingId) return
  panel.textContent = t.loading
  try {
    const result = qualityResultSchema.parse(
      (await call('excalidraw_diagram_get_quality_report', { drawingId })).structuredContent
    )
    qualityReport = {
      revision: result.irRevision,
      status: result.status,
      issues: result.validationReport?.issues ?? []
    }
    renderQuality()
  } catch (error) {
    panel.textContent = error instanceof ResultUnavailableError ? t.incomplete : t.noQuality
  }
}
const identity = z.object({ drawingId: z.string(), previewId: z.string().optional(), jobId: z.string().optional() })
app.ontoolresult = async (result) => {
  if (result.structuredContent?.resultStatus === 'unavailable') {
    ++epoch
    if (typeof result.structuredContent.drawingId === 'string') drawingId = result.structuredContent.drawingId
    setStatus('incomplete', 'failed')
    return
  }
  try {
    const value = identity.safeParse(result.structuredContent)
    if (!value.success) return
    const token = ++epoch
    drawingId = value.data.drawingId
    await readDrawing()
    if (token !== epoch) return
    if (value.data.previewId) await show(value.data.previewId, token)
    else if (value.data.jobId)
      await follow(
        jobResultSchema.parse((await call('excalidraw_get_job', { jobId: value.data.jobId })).structuredContent),
        token
      )
    else await refresh()
  } catch (error) {
    setStatus(error instanceof ResultUnavailableError ? 'incomplete' : 'failed', 'failed')
  }
}
app.onhostcontextchanged = context
app.onteardown = async () => {
  epoch++
  image.removeAttribute('src')
  return {}
}
translate()
setStatus('empty')
void app
  .connect()
  .then(context)
  .catch(() => {
    setStatus('failed', 'failed')
  })
