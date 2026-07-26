import * as React from 'react'
import { Badge, Card, Input, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import '@hyperframes/player'
import type { ExportSummary, HeaderContext, MotionRenderCapability, MotionRenderQuality, ProjectSummary } from './motion-types'
import type { Translator } from './i18n'
import {
  createHyperframesPreviewHtml,
  editHyperframesElement,
  inspectHyperframesHtml,
  type HyperframesEditableElement,
  type HyperframesInspection
} from './hyperframes-sdk'
import {
  createProductIntroHyperframesComposition,
  XPERT_AI_PRODUCT_INTRO
} from '../../../hyperframes-product-intro'
import { Button, MotionSelect, h } from './ui'
import { EditorToolbar } from './workbench-header'

const QUALITY_OPTIONS = [
  { value: 'draft', labelKey: 'renderQualityDraft' },
  { value: 'standard', labelKey: 'renderQualityStandard' },
  { value: 'high', labelKey: 'renderQualityHigh' }
] as const

const FPS_OPTIONS = [24, 30, 60] as const

export function HyperframesComposer(props: {
  htmlDraft: string
  selectedProject: ProjectSummary | null
  header: HeaderContext
  t: Translator
  saving: boolean
  renderCapability?: MotionRenderCapability
  latestExport?: ExportSummary | null
  onDraftChange: (value: string) => void
  onSave: () => void
  onRender: (quality: MotionRenderQuality, fps: 24 | 30 | 60) => void
}) {
  const [viewMode, setViewMode] = React.useState<'preview' | 'code'>('preview')
  const [device, setDevice] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [zoom, setZoom] = React.useState(1)
  const [quality, setQuality] = React.useState<MotionRenderQuality>('standard')
  const [fps, setFps] = React.useState<24 | 30 | 60>(30)
  const [previewRevision, setPreviewRevision] = React.useState(0)
  const [inspection, setInspection] = React.useState<HyperframesInspection | null>(null)
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState('')
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<string[]>([])
  const [elementDraft, setElementDraft] = React.useState(() => emptyElementDraft())

  React.useEffect(() => {
    if (!props.htmlDraft.trim()) {
      setPreviewUrl('')
      return undefined
    }
    const nextUrl = URL.createObjectURL(new Blob([createHyperframesPreviewHtml(props.htmlDraft)], { type: 'text/html' }))
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [previewRevision, props.htmlDraft])

  React.useEffect(() => {
    let disposed = false
    const timer = window.setTimeout(() => {
      void inspectHyperframesHtml(props.htmlDraft)
        .then((result) => {
          if (disposed) return
          setInspection(result)
          setValidationError(null)
        })
        .catch((error: unknown) => {
          if (disposed) return
          setInspection(null)
          setValidationError(error instanceof Error ? error.message : String(error))
        })
    }, 500)
    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [props.htmlDraft])

  React.useEffect(() => {
    setHistory([])
    setSelectedElementId(null)
  }, [props.selectedProject?.id])

  React.useEffect(() => {
    if (!inspection?.elements.length) {
      setSelectedElementId(null)
      return
    }
    if (!selectedElementId || !inspection.elements.some((element) => element.id === selectedElementId)) {
      setSelectedElementId(inspection.elements.find((element) => element.sceneTitle)?.id ?? inspection.elements[0].id)
    }
  }, [inspection, selectedElementId])

  const selectedElement = inspection?.elements.find((element) => element.id === selectedElementId) ?? null

  React.useEffect(() => {
    setElementDraft(selectedElement ? draftForElement(selectedElement) : emptyElementDraft())
  }, [selectedElement])

  const availableCapability = props.renderCapability?.available === true ? props.renderCapability : null
  const renderAvailable = Boolean(availableCapability)
  const latestExport = props.latestExport
  const qualityOptions = QUALITY_OPTIONS.map((option) => ({ value: option.value, label: props.t(option.labelKey) }))
  const scenes = inspection?.elements.filter((element) => element.sceneTitle) ?? []
  const activeScene = selectedElement?.sceneTitle
    ? selectedElement
    : scenes.find((scene) => isElementInsideScene(selectedElement, scene)) ?? scenes[0] ?? null
  const activeSceneElements = activeScene
    ? inspection?.elements.filter((element) => element.id !== activeScene.id && isElementInsideScene(element, activeScene)) ?? []
    : inspection?.elements ?? []

  function commitHtml(nextHtml: string) {
    setHistory((current) => [...current.slice(-19), props.htmlDraft])
    props.onDraftChange(nextHtml)
    setPreviewRevision((value) => value + 1)
  }

  function undoStructuredEdit() {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((current) => current.slice(0, -1))
    props.onDraftChange(previous)
    setPreviewRevision((value) => value + 1)
  }

  function applyXpertTemplate() {
    commitHtml(createProductIntroHyperframesComposition(XPERT_AI_PRODUCT_INTRO))
    setSelectedElementId('scene-brand')
  }

  async function applyElementChanges() {
    if (!selectedElement) return
    try {
      const styles = buildStyleEdits(selectedElement, elementDraft)
      const nextInspection = await editHyperframesElement(props.htmlDraft, {
        id: selectedElement.id,
        text: selectedElement.text === null ? undefined : elementDraft.text,
        start: parseNonNegativeNumber(elementDraft.start, selectedElement.start),
        duration: parsePositiveNumber(elementDraft.duration, selectedElement.duration),
        styles
      })
      commitHtml(nextInspection.html)
      setInspection(nextInspection)
      setValidationError(null)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section className="motion-workbench-surface video-surface hyperframes-surface">
      <EditorToolbar
        header={props.header}
        t={props.t}
        viewMode={viewMode}
        device={device}
        zoom={zoom}
        canUndo={history.length > 0}
        saving={props.saving}
        exportKinds={['mp4']}
        exportLabel={props.t('productionRender')}
        onViewModeChange={setViewMode}
        onDeviceChange={setDevice}
        onZoomChange={setZoom}
        onReplay={() => setPreviewRevision((value) => value + 1)}
        onUndo={undoStructuredEdit}
        onSave={props.onSave}
        onExport={() => props.onRender(quality, fps)}
      />

      <div className="hyperframes-engine-row">
        <div>
          <Badge variant="secondary">{props.t('hyperframesEngine')}</Badge>
          <span>{props.t('hyperframesEngineHelp')}</span>
        </div>
        <div className="hyperframes-validation">
          {validationError ? <Badge variant="outline" data-status="warning">{props.t('compositionInvalid')}</Badge> : <Badge variant="outline" data-status="success">{props.t('compositionValid')}</Badge>}
          {inspection ? <span>{props.t('compositionStats', { elements: inspection.elementCount, animations: inspection.animationCount })}</span> : null}
        </div>
      </div>

      <Card className="hyperframes-template-banner">
        <div>
          <strong>{props.t('hyperframesTemplate')}</strong>
          <span>{props.t('hyperframesTemplateHelp')}</span>
        </div>
        <Button variant="outline" onClick={applyXpertTemplate} disabled={props.saving}>
          {props.t('hyperframesUseXpertTemplate')}
        </Button>
      </Card>

      {viewMode === 'code' ? (
        <Card className="motion-panel motion-code-panel hyperframes-code-panel">
          <Textarea
            className="motion-code hyperframes-code"
            value={props.htmlDraft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            spellCheck={false}
          />
          {validationError ? <p className="hyperframes-error">{validationError}</p> : null}
        </Card>
      ) : (
        <div className="hyperframes-composer-layout">
          <Card className="motion-panel hyperframes-storyboard">
            <div className="hyperframes-panel-heading">
              <span className="motion-kicker">{props.t('hyperframesStoryboard')}</span>
              <strong>{inspection?.duration ? `${inspection.duration}s · ${scenes.length} ${props.t('scenes').toLowerCase()}` : props.t('loading')}</strong>
            </div>
            <div className="hyperframes-scene-list">
              {scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  className={scene.id === activeScene?.id ? 'active' : undefined}
                  onClick={() => setSelectedElementId(scene.id)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{scene.sceneTitle}</strong>
                  <small>{formatTiming(scene)}</small>
                </button>
              ))}
            </div>
            <div className="hyperframes-element-list">
              {activeSceneElements.map((element) => (
                <button
                  key={element.id}
                  type="button"
                  className={element.id === selectedElement?.id ? 'active' : undefined}
                  onClick={() => setSelectedElementId(element.id)}
                >
                  <span>{element.tag}</span>
                  <strong>{elementLabel(element)}</strong>
                </button>
              ))}
              {inspection && inspection.elements.length === 0 ? <p className="muted">{props.t('hyperframesNoElements')}</p> : null}
            </div>
          </Card>

          <div className="hyperframes-stage-layout">
            <Card className={`hyperframes-preview ${device}`} style={{ transform: `scale(${zoom})` }}>
              {previewUrl
                ? React.createElement('hyperframes-player', {
                    key: `${previewUrl}-${previewRevision}`,
                    src: previewUrl,
                    controls: true,
                    'audio-locked': true,
                    'aria-label': props.t('hyperframesPreview')
                  })
                : <div className="motion-empty">{props.t('hyperframesSourceEmpty')}</div>}
            </Card>
            <div className="hyperframes-side-stack">
              <Card className="motion-panel hyperframes-inspector">
                <div className="hyperframes-panel-heading">
                  <span className="motion-kicker">{props.t('hyperframesInspector')}</span>
                  <strong>{selectedElement ? props.t('hyperframesSelectedElement', { name: elementLabel(selectedElement) }) : props.t('selectElement')}</strong>
                  <p className="muted">{props.t('hyperframesInspectorHelp')}</p>
                </div>
                {selectedElement ? (
                  <div className="hyperframes-inspector-fields">
                    <label className="full">
                      <span>{props.t('hyperframesElementText')}</span>
                      <Textarea
                        value={elementDraft.text}
                        onChange={(event) => setElementDraft((current) => ({ ...current, text: event.target.value }))}
                        disabled={selectedElement.text === null}
                      />
                    </label>
                    <label>
                      <span>{props.t('hyperframesElementStart')}</span>
                      <Input type="number" min="0" step="0.05" value={elementDraft.start} onChange={(event) => setElementDraft((current) => ({ ...current, start: event.target.value }))} />
                    </label>
                    <label>
                      <span>{props.t('hyperframesElementDuration')}</span>
                      <Input type="number" min="0.05" step="0.05" value={elementDraft.duration} onChange={(event) => setElementDraft((current) => ({ ...current, duration: event.target.value }))} />
                    </label>
                    <label>
                      <span>{props.t('hyperframesElementX')}</span>
                      <Input type="number" step="1" value={elementDraft.left} onChange={(event) => setElementDraft((current) => ({ ...current, left: event.target.value }))} />
                    </label>
                    <label>
                      <span>{props.t('hyperframesElementY')}</span>
                      <Input type="number" step="1" value={elementDraft.top} onChange={(event) => setElementDraft((current) => ({ ...current, top: event.target.value }))} />
                    </label>
                    <label className="full">
                      <span>{props.t('hyperframesElementOpacity')}</span>
                      <Input type="number" min="0" max="1" step="0.05" value={elementDraft.opacity} onChange={(event) => setElementDraft((current) => ({ ...current, opacity: event.target.value }))} />
                    </label>
                    <Button className="full" onClick={() => void applyElementChanges()} disabled={props.saving}>
                      {props.t('hyperframesApplyElement')}
                    </Button>
                  </div>
                ) : null}
                {history.length > 0 ? <Button variant="ghost" onClick={undoStructuredEdit}>{props.t('hyperframesUndoEdit')}</Button> : null}
              </Card>

              <Card className="motion-panel hyperframes-render-panel">
                <div>
                  <span className="motion-kicker">{props.t('producer')}</span>
                  <h3>{props.t('productionRender')}</h3>
                  <p className="muted">{props.t('productionRenderHelp')}</p>
                </div>
                <label>
                  <span>{props.t('renderQuality')}</span>
                  <MotionSelect value={quality} options={qualityOptions} onValueChange={(value) => setQuality(value as MotionRenderQuality)} />
                </label>
                <label>
                  <span>{props.t('renderFps')}</span>
                  <MotionSelect value={String(fps)} options={FPS_OPTIONS.map((value) => ({ value: String(value), label: `${value} fps` }))} onValueChange={(value) => setFps(Number(value) as 24 | 30 | 60)} />
                </label>
                <Button onClick={() => props.onRender(quality, fps)} disabled={props.saving || !props.selectedProject || !renderAvailable || Boolean(validationError)}>
                  {props.t('queueProductionRender')}
                </Button>
                {!renderAvailable ? <p className="hyperframes-error">{props.renderCapability?.available === false ? props.renderCapability.message || props.renderCapability.reason : props.t('runtimeUnavailable')}</p> : null}
                {availableCapability ? <p className="muted">{props.t('runtimeReady', { profile: availableCapability.runtimeProfile || 'browser/video-playwright-1.61/v1', workers: availableCapability.workerCount || 0 })}</p> : null}
                {latestExport ? (
                  <div className="hyperframes-render-status">
                    <strong>{props.t('latestRender')}</strong>
                    <Badge variant="outline" data-status={latestExport.status === 'succeeded' ? 'success' : latestExport.status === 'failed' ? 'warning' : undefined}>
                      {String(latestExport.status || 'queued')}
                    </Badge>
                    <span>{Math.round(latestExport.progress || 0)}% · {latestExport.stage || latestExport.backend || 'hyperframes'}</span>
                    {latestExport.errorMessage ? <span className="hyperframes-error">{latestExport.errorMessage}</span> : null}
                  </div>
                ) : null}
              </Card>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

type ElementDraft = ReturnType<typeof emptyElementDraft>

function emptyElementDraft() {
  return { text: '', start: '', duration: '', left: '', top: '', opacity: '' }
}

function draftForElement(element: HyperframesEditableElement): ElementDraft {
  return {
    text: element.text ?? '',
    start: finiteString(element.start),
    duration: finiteString(element.duration),
    left: cssNumber(element.inlineStyles.left),
    top: cssNumber(element.inlineStyles.top),
    opacity: cssNumber(element.inlineStyles.opacity)
  }
}

function buildStyleEdits(element: HyperframesEditableElement, draft: ElementDraft) {
  const result: Record<string, string | null> = {}
  addStyleEdit(result, 'left', draft.left, element.inlineStyles.left, 'px')
  addStyleEdit(result, 'top', draft.top, element.inlineStyles.top, 'px')
  addStyleEdit(result, 'opacity', draft.opacity, element.inlineStyles.opacity)
  return result
}

function addStyleEdit(
  result: Record<string, string | null>,
  property: string,
  draft: string,
  current: string | undefined,
  suffix = ''
) {
  const normalized = draft.trim()
  if (!normalized && current) result[property] = null
  else if (normalized && `${normalized}${suffix}` !== current) result[property] = `${normalized}${suffix}`
}

function parseNonNegativeNumber(value: string, fallback: number | null) {
  if (!value.trim()) return fallback ?? undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback ?? undefined
}

function parsePositiveNumber(value: string, fallback: number | null) {
  if (!value.trim()) return fallback ?? undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback ?? undefined
}

function finiteString(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(3))) : ''
}

function cssNumber(value: string | undefined) {
  if (!value) return ''
  const match = value.trim().match(/^-?\d+(?:\.\d+)?/)
  return match?.[0] ?? ''
}

function isElementInsideScene(element: HyperframesEditableElement | null, scene: HyperframesEditableElement) {
  if (!element || element.start === null || scene.start === null || scene.duration === null) return false
  return element.start >= scene.start && element.start < scene.start + scene.duration
}

function elementLabel(element: HyperframesEditableElement) {
  if (element.sceneTitle) return element.sceneTitle
  const text = element.text?.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 44) : element.id
}

function formatTiming(element: HyperframesEditableElement) {
  const start = element.start ?? 0
  const duration = element.duration ?? 0
  return `${Number(start.toFixed(2))}–${Number((start + duration).toFixed(2))}s`
}
