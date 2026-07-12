import * as React from 'react'
import { Card } from '@xpert-ai/plugin-shadcn-ui'
import { Input } from '@xpert-ai/plugin-shadcn-ui'
import { Textarea } from '@xpert-ai/plugin-shadcn-ui'
import {
  computeHtmlTimelineLayout,
  createDefaultHtmlTracks,
  htmlTimelineItems
} from '../../../workbench-model'
import { injectMotionRuntime, normalizeMotionKeyframeTracks } from '../../../html-motion'
import type { RemotePayloadObject } from './runtime'
import { getErrorMessage, notify } from './runtime'
import {
  KEYFRAME_PROPS,
  MOTION_TRIGGERS,
  MOTION_VERBS,
  type HeaderContext,
  type HtmlControls,
  type ProjectSummary
} from './motion-types'
import { labelForTrigger, type Translator } from './i18n'
import { Button, MotionSlider, h } from './ui'
import { EditorToolbar } from './workbench-header'
import { TimelinePanel } from './timeline-panels'
import {
  applyHtmlSelectionMotion,
  ensureIframeEditable,
  formatTrackValue,
  labelForElement,
  lastTrackValue,
  outlineIframeSelection,
  safeJsonObject,
  seekIframeMotion,
  serializeHtmlDocument,
  wireIframeSelection
} from './html-workbench-utils'

export function HtmlWorkbench(props: {
  controls: HtmlControls
  htmlDraft: string
  componentSelection: RemotePayloadObject | null
  saving: boolean
  selectedProject: ProjectSummary | null
  header: HeaderContext
  t: Translator
  onControlsChange: (controls: HtmlControls) => void
  onApply: () => void
  onDraftChange: (value: string) => void
  onComponentSelectionChange: (selection: RemotePayloadObject | null) => void
  onSave: () => void
  onExport: (kind: 'html' | 'css' | 'json' | 'react' | 'lottie') => void
}) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const [viewMode, setViewMode] = React.useState<'preview' | 'code'>('preview')
  const [device, setDevice] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [zoom, setZoom] = React.useState(1)
  const [inspectorMode, setInspectorMode] = React.useState<'preset' | 'keyframes'>('keyframes')
  const [selectedId, setSelectedId] = React.useState<string>(() => (typeof props.componentSelection?.componentId === 'string' ? props.componentSelection.componentId : ''))
  const [timelineTime, setTimelineTime] = React.useState(0)
  const [previewNonce, setPreviewNonce] = React.useState(0)
  const [undoStack, setUndoStack] = React.useState<string[]>([])
  const motionTimelineItems = React.useMemo(() => htmlTimelineItems(props.htmlDraft), [props.htmlDraft])
  const timelineItems = React.useMemo(() => {
    if (motionTimelineItems.length > 0) {
      return motionTimelineItems
    }
    const fallbackId = selectedId || (typeof props.componentSelection?.componentId === 'string' ? props.componentSelection.componentId : '')
    if (!fallbackId) {
      return []
    }
    return [
      {
        id: fallbackId,
        label: typeof props.componentSelection?.label === 'string' ? props.componentSelection.label : props.t('selectElement'),
        verb: props.controls.verb,
        trigger: props.controls.trigger,
        delay: Number(props.controls.delay || 0),
        duration: Number(props.controls.duration || 520)
      }
    ]
  }, [motionTimelineItems, props.componentSelection, props.controls, props.t, selectedId])
  const timelineLayout = React.useMemo(() => computeHtmlTimelineLayout(timelineItems), [timelineItems])
  const selectedItem = timelineItems.find((item) => item.id === selectedId) ?? timelineItems[0] ?? null
  const tracks = React.useMemo(() => normalizeMotionKeyframeTracks(safeJsonObject(props.controls.tracksJson) ?? createDefaultHtmlTracks()), [props.controls.tracksJson])
  const timelineDurationMs = timelineLayout.duration
  const previewHtml = React.useMemo(() => {
    try {
      return injectMotionRuntime(props.htmlDraft)
    } catch {
      return props.htmlDraft
    }
  }, [props.htmlDraft])

  React.useEffect(() => {
    if (!selectedId && selectedItem?.id) {
      setSelectedId(selectedItem.id)
      props.onComponentSelectionChange({ componentId: selectedItem.id, label: selectedItem.label })
    }
  }, [props, selectedId, selectedItem])

  function handlePreviewLoad() {
    const frame = iframeRef.current
    const doc = frame?.contentDocument
    if (!doc) {
      return
    }
    const ensure = ensureIframeEditable(doc)
    if (ensure.changed) {
      props.onDraftChange(serializeHtmlDocument(doc))
    }
    if (!selectedId && ensure.components[0]) {
      const first = ensure.components[0]
      setSelectedId(first.id)
      props.onComponentSelectionChange({ componentId: first.id, label: first.label })
      props.onControlsChange({
        ...props.controls,
        selector: `[data-ma-id="${first.id}"]`
      })
    }
    wireIframeSelection(doc, (element) => {
      const id = element.getAttribute('data-ma-id') || ''
      if (!id) {
        return
      }
      setSelectedId(id)
      props.onComponentSelectionChange({ componentId: id, label: labelForElement(element) })
      props.onControlsChange({
        ...props.controls,
        selector: `[data-ma-id="${id}"]`,
        verb: (element.getAttribute('data-ma-anim') as HtmlControls['verb']) || props.controls.verb,
        trigger: (element.getAttribute('data-ma-trigger') as HtmlControls['trigger']) || props.controls.trigger,
        duration: Number(element.getAttribute('data-ma-dur') || props.controls.duration),
        delay: Number(element.getAttribute('data-ma-delay') || props.controls.delay),
        distance: Number(element.getAttribute('data-ma-dist') || props.controls.distance),
        tracksJson: element.getAttribute('data-ma-tracks') || props.controls.tracksJson
      })
    })
    outlineIframeSelection(doc, selectedId)
  }

  React.useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (doc) {
      outlineIframeSelection(doc, selectedId)
    }
  }, [selectedId])

  function replayMotion() {
    setTimelineTime(0)
    setViewMode('preview')
    setPreviewNonce((nonce) => nonce + 1)
  }

  function seekHtml(time: number) {
    setTimelineTime(time)
    const win = iframeRef.current?.contentWindow as (Window & { __maTimeline?: { seek?: (time: number) => void } }) | null
    win?.__maTimeline?.seek?.(time)
    const doc = iframeRef.current?.contentDocument
    if (doc) {
      seekIframeMotion(doc, time, { selectedId, controls: props.controls })
    }
  }

  function updateTrack(prop: (typeof KEYFRAME_PROPS)[number], value: number) {
    const current = normalizeMotionKeyframeTracks(safeJsonObject(props.controls.tracksJson) ?? createDefaultHtmlTracks())
    const points = current[prop] && current[prop]!.length >= 2 ? [...current[prop]!] : [{ t: 0, v: prop === 'opacity' ? 0 : prop === 'scale' ? 0.96 : 0 }, { t: 0.5, v: prop === 'opacity' || prop === 'scale' ? 1 : 0 }]
    points[points.length - 1] = { ...points[points.length - 1], v: value }
    props.onControlsChange({ ...props.controls, tracksJson: JSON.stringify({ ...current, [prop]: points }, null, 2) })
  }

  function applySelection(nextControls = props.controls) {
    if (!selectedId) {
      notify('warning', props.t('selectElementFirst'))
      return
    }
    try {
      setUndoStack((stack) => [...stack.slice(-9), props.htmlDraft])
      const nextHtml = applyHtmlSelectionMotion(props.htmlDraft, selectedId, nextControls)
      props.onDraftChange(nextHtml)
      props.onComponentSelectionChange({ componentId: selectedId, label: selectedItem?.label ?? selectedId, trigger: nextControls.trigger, verb: nextControls.verb })
    } catch (error) {
      notify('error', getErrorMessage(error))
    }
  }

  function undoHtml() {
    const previous = undoStack[undoStack.length - 1]
    if (!previous) {
      return
    }
    setUndoStack((stack) => stack.slice(0, -1))
    props.onDraftChange(previous)
  }

  return (
    <section className="motion-workbench-surface html-surface">
      <EditorToolbar
        header={props.header}
        t={props.t}
        viewMode={viewMode}
        device={device}
        zoom={zoom}
        canUndo={undoStack.length > 0}
        onViewModeChange={setViewMode}
        onDeviceChange={setDevice}
        onZoomChange={setZoom}
        onReplay={replayMotion}
        onUndo={undoHtml}
        onSave={props.onSave}
        onExport={(kind) => props.onExport(kind as 'html' | 'css' | 'json' | 'react' | 'lottie')}
        saving={props.saving}
        exportKinds={['html', 'css', 'json', 'react', 'lottie']}
      />
      {viewMode === 'code' ? (
        <Card className="motion-panel motion-code-panel">
          <Textarea className="motion-code" value={props.htmlDraft} onChange={(event) => props.onDraftChange(event.target.value)} spellCheck={false} />
        </Card>
      ) : (
        <div className="html-stage-layout">
          <div className={`html-device-frame ${device}`} style={{ transform: `scale(${zoom})` }}>
            <iframe key={`${device}-${previewNonce}`} ref={iframeRef} title={props.t('html')} sandbox="allow-scripts allow-same-origin" srcDoc={previewHtml} onLoad={handlePreviewLoad} />
          </div>
          <Card className="motion-inspector">
            <div className="inspector-title">
              <div>
                <span className="selection-dot" />
                <strong>{selectedItem?.label || props.t('selectElement')}</strong>
              </div>
            </div>
            <div className="segmented">
              <Button variant={inspectorMode === 'preset' ? 'default' : 'outline'} className={inspectorMode === 'preset' ? 'active' : ''} onClick={() => setInspectorMode('preset')}>
                {props.t('preset')}
              </Button>
              <Button variant={inspectorMode === 'keyframes' ? 'default' : 'outline'} className={inspectorMode === 'keyframes' ? 'active' : ''} onClick={() => setInspectorMode('keyframes')}>
                {props.t('keyframes')}
              </Button>
            </div>
            <section className="inspector-section">
              <span className="section-eyebrow">{props.t('trigger')}</span>
              <div className="chip-grid four">
                {MOTION_TRIGGERS.map((trigger) => (
                  <Button
                    key={trigger}
                    variant={trigger === props.controls.trigger ? 'default' : 'outline'}
                    className={trigger === props.controls.trigger ? 'chip-button active' : 'chip-button'}
                    onClick={() => {
                      const next = { ...props.controls, trigger }
                      props.onControlsChange(next)
                      applySelection(next)
                    }}
                  >
                    {labelForTrigger(trigger, props.t)}
                  </Button>
                ))}
              </div>
            </section>
            {inspectorMode === 'preset' ? (
              <section className="inspector-section">
                <span className="section-eyebrow">{props.t('motionLabel')}</span>
                <div className="chip-grid">
                  {MOTION_VERBS.map((verb) => (
                    <Button
                      key={verb}
                      variant={verb === props.controls.verb ? 'default' : 'outline'}
                      className={verb === props.controls.verb ? 'chip-button active' : 'chip-button'}
                      onClick={() => {
                        const next = { ...props.controls, verb }
                        props.onControlsChange(next)
                        applySelection(next)
                      }}
                    >
                      {verb}
                    </Button>
                  ))}
                </div>
              </section>
            ) : (
              <section className="inspector-section">
                <span className="section-eyebrow">{props.t('keyframes')}</span>
                <label className="range-row">
                  <span>{props.t('scrub')}</span>
                  <MotionSlider min={0} max={timelineDurationMs} step={20} value={timelineTime} onChange={seekHtml} />
                  <em>{Math.round(timelineTime)}ms</em>
                </label>
                {KEYFRAME_PROPS.map((prop) => (
                  <label key={prop} className="range-row">
                    <span>{prop}</span>
                    <MotionSlider
                      min={prop === 'opacity' ? 0 : prop === 'scale' ? 0.2 : prop === 'rotate' ? -180 : -160}
                      max={prop === 'opacity' ? 1 : prop === 'scale' ? 2 : prop === 'rotate' ? 180 : 160}
                      step={prop === 'opacity' || prop === 'scale' ? 0.01 : 1}
                      value={lastTrackValue(tracks[prop], prop)}
                      onChange={(value) => updateTrack(prop, value)}
                    />
                    <em>{formatTrackValue(prop, lastTrackValue(tracks[prop], prop))}</em>
                  </label>
                ))}
                <Textarea className="motion-code-small" value={props.controls.tracksJson} onChange={(event) => props.onControlsChange({ ...props.controls, tracksJson: event.target.value })} />
              </section>
            )}
            <section className="inspector-section compact-form">
              <div className="motion-form-grid">
                <label>
                  <span>{props.t('duration')}</span>
                  <Input type="number" value={props.controls.duration} onChange={(event) => props.onControlsChange({ ...props.controls, duration: Number(event.target.value) })} />
                </label>
                <label>
                  <span>{props.t('delay')}</span>
                  <Input type="number" value={props.controls.delay} onChange={(event) => props.onControlsChange({ ...props.controls, delay: Number(event.target.value) })} />
                </label>
                <label>
                  <span>{props.t('distance')}</span>
                  <Input type="number" value={props.controls.distance} onChange={(event) => props.onControlsChange({ ...props.controls, distance: Number(event.target.value) })} />
                </label>
              </div>
              <Button className="full-width" onClick={() => applySelection()} disabled={!selectedId}>
                {props.t('applyMotion')}
              </Button>
            </section>
          </Card>
        </div>
      )}
      <TimelinePanel
        layout={timelineLayout}
        selectedId={selectedId}
        scope={motionTimelineItems.length > 0 ? 'all' : 'selection'}
        time={timelineTime}
        t={props.t}
        onSelect={(id) => setSelectedId(id)}
        onSeek={seekHtml}
      />
    </section>
  )
}
