import * as React from 'react'
import { Badge, Card, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import '@hyperframes/player'
import type { ExportSummary, HeaderContext, MotionRenderCapability, MotionRenderQuality, ProjectSummary } from './motion-types'
import type { Translator } from './i18n'
import { inspectHyperframesHtml } from './hyperframes-sdk'
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
  const [inspection, setInspection] = React.useState<{ elementCount: number; animationCount: number } | null>(null)
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState('')

  React.useEffect(() => {
    if (!props.htmlDraft.trim()) {
      setPreviewUrl('')
      return undefined
    }
    const nextUrl = URL.createObjectURL(new Blob([props.htmlDraft], { type: 'text/html' }))
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [previewRevision, props.htmlDraft])

  React.useEffect(() => {
    let disposed = false
    const timer = window.setTimeout(() => {
      void inspectHyperframesHtml(props.htmlDraft)
        .then((result) => {
          if (disposed) return
          setInspection({ elementCount: result.elementCount, animationCount: result.animationCount })
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

  const availableCapability = props.renderCapability?.available === true ? props.renderCapability : null
  const renderAvailable = Boolean(availableCapability)
  const latestExport = props.latestExport
  const qualityOptions = QUALITY_OPTIONS.map((option) => ({ value: option.value, label: props.t(option.labelKey) }))

  return (
    <section className="motion-workbench-surface video-surface hyperframes-surface">
      <EditorToolbar
        header={props.header}
        t={props.t}
        viewMode={viewMode}
        device={device}
        zoom={zoom}
        canUndo={false}
        saving={props.saving}
        exportKinds={['mp4']}
        exportLabel={props.t('productionRender')}
        onViewModeChange={setViewMode}
        onDeviceChange={setDevice}
        onZoomChange={setZoom}
        onReplay={() => setPreviewRevision((value) => value + 1)}
        onUndo={() => undefined}
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
      )}
    </section>
  )
}
