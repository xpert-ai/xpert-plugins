import * as React from 'react'
import { Card } from '@xpert-ai/plugin-shadcn-ui/components/card'
import { Input } from '@xpert-ai/plugin-shadcn-ui/components/input'
import { Textarea } from '@xpert-ai/plugin-shadcn-ui/components/textarea'
import {
  MOTION_TEMPLATE_GROUPS,
  VIDEO_LAYER_TYPES,
  addLayerToComposition,
  addSceneToComposition,
  applyMotionTemplate,
  attachMotionPath,
  createVideoLayer,
  findLayer,
  getLayerList,
  getSceneList,
  hitTestLayer,
  moveLayerAtTime,
  moveLayerInComposition,
  removeLayerFromComposition,
  setLayerTrackPoint,
  setSceneDuration,
  setSceneTransition,
  updateLayerInComposition
} from '../../../workbench-model'
import type { MotionTemplateKey, VideoLayerType } from '../../../workbench-model'
import type { MotionVideoLayer } from '../../../types'
import type { RemotePayloadObject, RemotePayloadValue } from './runtime'
import { executeFileAction, getErrorMessage, notify } from './runtime'
import type { MotionVideoComposition } from './video-renderer'
import { KINETIC_OPTIONS, type HeaderContext, type ProjectSummary } from './motion-types'
import { localizeOptions, type Translator } from './i18n'
import { Button, MotionSelect, MotionSlider, h } from './ui'
import { EditorToolbar } from './workbench-header'
import { SceneStrip, VideoTimeline } from './timeline-panels'

type MediaPayload = {
  src: string
  filePath?: string
  fileUrl?: string
  mimeType?: string
}

export function VideoComposer(props: {
  canvasRef: React.RefObject<HTMLCanvasElement>
  videoDraft: string
  videoTime: number
  selectedProject: ProjectSummary | null
  layerSelection: RemotePayloadObject | null
  header: HeaderContext
  t: Translator
  duration: number
  saving: boolean
  exportProgress: number | null
  parseVideoComposition: (value: string) => MotionVideoComposition
  defaultComposition: (title: string) => MotionVideoComposition
  extractMediaPayload: (value: RemotePayloadValue | null) => MediaPayload | null
  onDraftChange: (value: string) => void
  onTimeChange: (value: number) => void
  onLayerSelectionChange: (selection: RemotePayloadObject | null) => void
  onSave: () => void
  onExportMp4: () => void
}) {
  const [viewMode, setViewMode] = React.useState<'preview' | 'code'>('preview')
  const [device, setDevice] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [zoom, setZoom] = React.useState(1)
  const [tool, setTool] = React.useState<'select' | 'path'>('select')
  const [sceneIndex, setSceneIndex] = React.useState(0)
  const [selectedTemplate, setSelectedTemplate] = React.useState<MotionTemplateKey>('slide-up')
  const [styleName, setStyleName] = React.useState('')
  const [playing, setPlaying] = React.useState(false)
  const dragRef = React.useRef<{ id: string; x: number; y: number } | null>(null)
  const pathRef = React.useRef<Array<{ x: number; y: number }>>([])
  const playStateRef = React.useRef({ time: props.videoTime, duration: props.duration, onTimeChange: props.onTimeChange })
  const composition = React.useMemo(() => {
    try {
      return props.parseVideoComposition(props.videoDraft)
    } catch {
      return props.defaultComposition(props.t('invalidCompositionJson'))
    }
  }, [props])
  const scenes = getSceneList(composition)
  const activeSceneIndex = scenes.length > 0 ? Math.min(sceneIndex, scenes.length - 1) : -1
  const layers = [...(composition.shared || []), ...getLayerList(composition, activeSceneIndex)]
  const selectedLayerId = typeof props.layerSelection?.layerId === 'string' ? props.layerSelection.layerId : layers[0]?.id || ''
  const selectedLayer = selectedLayerId ? findLayer(composition, selectedLayerId, activeSceneIndex) : null

  React.useEffect(() => {
    playStateRef.current = {
      time: props.videoTime,
      duration: props.duration,
      onTimeChange: props.onTimeChange
    }
  }, [props.duration, props.onTimeChange, props.videoTime])

  React.useEffect(() => {
    if (!playing) {
      return undefined
    }

    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const state = playStateRef.current
      const delta = Math.min(0.08, Math.max(0, (now - previous) / 1000))
      previous = now
      const next = Math.min(state.duration, state.time + delta)
      state.onTimeChange(next)
      if (next >= state.duration - 0.01) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  React.useEffect(() => {
    if (!selectedLayerId && layers[0]?.id) {
      props.onLayerSelectionChange({ layerId: layers[0].id, sceneIndex: activeSceneIndex })
    }
  }, [activeSceneIndex, layers, props, selectedLayerId])

  function previewFromStart() {
    props.onTimeChange(0)
    setPlaying(true)
  }

  function togglePreview() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (props.videoTime >= props.duration - 0.05) {
      props.onTimeChange(0)
    }
    setPlaying(true)
  }

  function mutate(next: MotionVideoComposition, selection?: RemotePayloadObject | null) {
    props.onDraftChange(JSON.stringify(next, null, 2))
    if (selection !== undefined) {
      props.onLayerSelectionChange(selection)
    }
  }

  function selectLayer(layerId: string | null) {
    props.onLayerSelectionChange(layerId ? { layerId, sceneIndex: activeSceneIndex } : null)
  }

  function addLayer(type: VideoLayerType) {
    const layer = createVideoLayer(type, composition, layers.length + 1)
    mutate(addLayerToComposition(composition, activeSceneIndex, layer), { layerId: layer.id || '', sceneIndex: activeSceneIndex })
  }

  function updateLayer(updater: (layer: MotionVideoLayer) => MotionVideoLayer | null | undefined) {
    if (!selectedLayerId) {
      return
    }
    mutate(
      updateLayerInComposition(composition, activeSceneIndex, selectedLayerId, (layer) => {
        const next = updater(layer)
        return next ?? layer
      })
    )
  }

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = props.canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const width = composition.w || 1280
    const height = composition.h || 720
    if (!rect) {
      return { x: 0, y: 0 }
    }
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height
    }
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event)
    if (tool === 'path') {
      pathRef.current = [point]
      return
    }
    const hit = hitTestLayer(layers, point.x, point.y)
    if (hit?.id) {
      selectLayer(hit.id)
      dragRef.current = { id: hit.id, x: point.x, y: point.y }
    } else {
      selectLayer(null)
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event)
    if (tool === 'path' && pathRef.current.length > 0) {
      pathRef.current.push(point)
      return
    }
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const dx = point.x - drag.x
    const dy = point.y - drag.y
    dragRef.current = { ...drag, x: point.x, y: point.y }
    mutate(updateLayerInComposition(composition, activeSceneIndex, drag.id, (layer) => moveLayerAtTime(layer, dx, dy, props.videoTime)))
  }

  function pointerUp() {
    const path = pathRef.current
    if (tool === 'path' && selectedLayerId && path.length > 1) {
      mutate(updateLayerInComposition(composition, activeSceneIndex, selectedLayerId, (layer) => attachMotionPath(layer, path, 'raw')))
    }
    pathRef.current = []
    dragRef.current = null
  }

  async function uploadMedia(file: File, purpose: string, target: 'selected-layer' | 'background' | 'reference') {
    if (!props.selectedProject?.id) {
      notify('warning', props.t('createOrSaveBeforeUpload'))
      return
    }
    try {
      const response = await executeFileAction(
        'upload_media_file',
        props.selectedProject.id,
        { projectId: props.selectedProject.id, purpose },
        { projectId: props.selectedProject.id },
        file
      )
      const media = props.extractMediaPayload(response)
      if (!media?.src) {
        throw new Error(props.t('mediaUploadNoSource'))
      }
      if (target === 'background') {
        mutate({ ...composition, bg: media.src })
      } else if (target === 'reference') {
        mutate({ ...composition, reference: { src: media.src, filePath: media.filePath || null, mimeType: media.mimeType || file.type } })
      } else if (selectedLayerId) {
        mutate(updateLayerInComposition(composition, activeSceneIndex, selectedLayerId, (layer) => ({ ...layer, src: media.src, filePath: media.filePath, fileUrl: media.fileUrl })))
      }
      notify('success', props.t('mediaUploaded'))
    } catch (error) {
      notify('error', getErrorMessage(error))
    }
  }

  return (
    <section className="motion-workbench-surface video-surface">
      <EditorToolbar
        header={props.header}
        t={props.t}
        viewMode={viewMode}
        device={device}
        zoom={zoom}
        canUndo={false}
        onViewModeChange={setViewMode}
        onDeviceChange={setDevice}
        onZoomChange={setZoom}
        onReplay={previewFromStart}
        onUndo={() => undefined}
        onSave={props.onSave}
        onExport={() => props.onExportMp4()}
        saving={props.saving}
        exportKinds={['mp4']}
      />
      {viewMode === 'code' ? (
        <Card className="motion-panel motion-code-panel">
          <Textarea className="motion-code motion-video-code" value={props.videoDraft} onChange={(event) => props.onDraftChange(event.target.value)} spellCheck={false} />
        </Card>
      ) : (
        <div className="video-stage-layout">
          <Card className="video-main">
            <div className="tool-row">
              <Button variant={tool === 'select' ? 'default' : 'outline'} className={tool === 'select' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('select')}>
                {props.t('select')}
              </Button>
              <Button variant={tool === 'path' ? 'default' : 'outline'} className={tool === 'path' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('path')}>
                {props.t('path')}
              </Button>
              <span>{tool === 'path' ? props.t('drawPathHint') : props.t('dragLayerHint')}</span>
            </div>
            <div className={`video-canvas-wrap ${device}`} style={{ transform: `scale(${zoom})` }}>
              <canvas ref={props.canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={pointerUp} />
            </div>
            <div className="video-transport-panel">
              <div className="video-transport-title">
                <strong>{props.t('previewFilmControl')}</strong>
                <span>{props.t('previewFilmHelp')}</span>
              </div>
              <div className="transport-row">
                <Button className="play-button" onClick={togglePreview} title={props.t(playing ? 'videoPause' : 'videoPlay')}>
                  {playing ? '||' : '▶'}
                </Button>
                <MotionSlider min={0} max={Math.max(0.5, props.duration)} step={0.05} value={Math.min(props.videoTime, props.duration)} onChange={props.onTimeChange} />
                <strong>
                  {props.videoTime.toFixed(2)} / {props.duration.toFixed(2)}s
                </strong>
                <Button variant="outline" onClick={props.onExportMp4} disabled={props.saving}>
                  {props.t('exportMp4')}
                </Button>
                {props.exportProgress !== null ? <span>{Math.round(props.exportProgress * 100)}%</span> : null}
              </div>
            </div>
            <SceneStrip
              composition={composition}
              activeSceneIndex={activeSceneIndex}
              t={props.t}
              onSelect={setSceneIndex}
              onAdd={() => mutate(addSceneToComposition(composition))}
              onDuration={(duration) => mutate(setSceneDuration(composition, activeSceneIndex, duration))}
              onTransition={(transition) => mutate(setSceneTransition(composition, activeSceneIndex, transition))}
            />
            <div className="media-row">
              <label className="upload-pill">
                {props.t('uploadVideoBackground')}
                <input type="file" accept="video/*,image/*" onChange={(event) => event.target.files?.[0] && void uploadMedia(event.target.files[0], 'background', 'background')} />
              </label>
              <label className="upload-pill">
                {props.t('uploadReference')}
                <input type="file" accept="video/*,image/*,.gif" onChange={(event) => event.target.files?.[0] && void uploadMedia(event.target.files[0], 'reference', 'reference')} />
              </label>
            </div>
            <VideoTimeline layers={layers} selectedLayerId={selectedLayerId} duration={props.duration} time={props.videoTime} t={props.t} onSeek={props.onTimeChange} />
          </Card>
          <aside className="video-side">
            <Card className="side-card">
              <h3>{props.t('layers')}</h3>
              <div className="layer-add-grid">
                {VIDEO_LAYER_TYPES.map((type) => (
                  <Button key={type} variant="outline" className="chip-button" onClick={() => addLayer(type)}>
                    + {layerTypeLabel(type, props.t)}
                  </Button>
                ))}
              </div>
              <div className="layer-list">
                {layers.map((layer) => (
                  <div
                    key={layer.id || layer.text}
                    role="button"
                    tabIndex={0}
                    className={layer.id === selectedLayerId ? 'layer-row active' : 'layer-row'}
                    onClick={() => layer.id && selectLayer(layer.id)}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && layer.id) {
                        event.preventDefault()
                        selectLayer(layer.id)
                      }
                    }}
                  >
                    <span>{layerTypeLabel(layer.type, props.t)}</span>
                    <strong>{layer.text || layer.id || props.t('untitled')}</strong>
                    <Button
                      variant="destructiveOutline"
                      className="mini-danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (layer.id) mutate(removeLayerFromComposition(composition, activeSceneIndex, layer.id), null)
                      }}
                    >
                      {props.t('delete')}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="side-card">
              <h3>{props.t('properties')}</h3>
              {selectedLayer ? (
                <div className="property-grid">
                  <label>
                    <span>{props.t('text')}</span>
                    <Input value={selectedLayer.text || ''} onChange={(event) => updateLayer((layer) => ({ ...layer, text: event.target.value }))} disabled={selectedLayer.type !== 'text'} />
                  </label>
                  <label>
                    <span>{props.t('color')}</span>
                    <Input type="color" value={(selectedLayer.color || selectedLayer.fill || '#ffffff').slice(0, 7)} onChange={(event) => updateLayer((layer) => ({ ...layer, color: event.target.value, fill: event.target.value }))} />
                  </label>
                  {(['x', 'y', 'w', 'h', 'opacity', 'scale', 'rotate'] as const).map((field) => (
                    <label key={field}>
                      <span>{field}</span>
                      <Input
                        type="number"
                        step={field === 'opacity' || field === 'scale' ? 0.05 : 1}
                        value={Number(selectedLayer[field] ?? (field === 'opacity' || field === 'scale' ? 1 : 0))}
                        onChange={(event) => updateLayer((layer) => ({ ...layer, [field]: Number(event.target.value) }))}
                      />
                    </label>
                  ))}
                  <label>
                    <span>{props.t('kineticText')}</span>
                    <MotionSelect
                      value={typeof selectedLayer.kinetic?.type === 'string' ? selectedLayer.kinetic.type : 'none'}
                      options={localizeOptions(KINETIC_OPTIONS, props.t)}
                      onValueChange={(value) => updateLayer((layer) => ({ ...layer, kinetic: value === 'none' ? undefined : { type: value, stagger: 0.04 } }))}
                    />
                  </label>
                  <label className="upload-pill inline">
                    {props.t('uploadLayerMedia')}
                    <input type="file" accept="image/*,video/*" onChange={(event) => event.target.files?.[0] && void uploadMedia(event.target.files[0], 'layer', 'selected-layer')} />
                  </label>
                  <div className="accordion-block">
                    <strong>{props.t('keyframes')}</strong>
                    {(['opacity', 'x', 'y', 'scale', 'rotate', 'blur'] as const).map((prop) => (
                      <Button key={prop} variant="outline" className="chip-button" onClick={() => updateLayer((layer) => setLayerTrackPoint(layer, prop, props.videoTime, Number(layer[prop] ?? (prop === 'opacity' || prop === 'scale' ? 1 : 0))))}>
                        {props.t('setProperty', { property: prop })}
                      </Button>
                    ))}
                  </div>
                  <div className="accordion-block">
                    <strong>{props.t('motionPath')}</strong>
                    <Button variant="outline" className="chip-button" onClick={() => updateLayer((layer) => attachMotionPath(layer, [{ x: Number(layer.x || 0) - 160, y: Number(layer.y || 0) }, { x: Number(layer.x || 0) + 160, y: Number(layer.y || 0) }], 'line'))}>
                      {props.t('line')}
                    </Button>
                    <Button variant="outline" className="chip-button" onClick={() => updateLayer((layer) => ({ ...layer, path: undefined }))}>
                      {props.t('clearPath')}
                    </Button>
                  </div>
                  <div className="accordion-block">
                    <strong>{props.t('motionLabel')}</strong>
                    {MOTION_TEMPLATE_GROUPS.map((group) => (
                      <div key={group.group} className="template-group">
                        <span>{templateGroupLabel(group.group, props.t)}</span>
                        <div className="chip-grid">
                          {group.templates.map((template) => (
                            <Button key={template} variant={template === selectedTemplate ? 'default' : 'outline'} className={template === selectedTemplate ? 'chip-button active' : 'chip-button'} onClick={() => setSelectedTemplate(template)}>
                              {template}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <Button className="full-width" onClick={() => updateLayer((layer) => applyMotionTemplate(layer, selectedTemplate))}>
                      {props.t('applySelected')}
                    </Button>
                  </div>
                  <div className="accordion-block">
                    <strong>{props.t('motionStyles')}</strong>
                    <Input value={styleName} onChange={(event) => setStyleName(event.target.value)} placeholder={props.t('nameMotionPlaceholder')} />
                    <Button variant="outline" onClick={() => notify('info', styleName ? props.t('styleReady', { name: styleName }) : props.t('nameStyleFirst'))}>
                      {props.t('saveStyle')}
                    </Button>
                  </div>
                  <div className="motion-button-row">
                    <Button variant="outline" onClick={() => selectedLayerId && mutate(moveLayerInComposition(composition, activeSceneIndex, selectedLayerId, -1))}>
                      {props.t('up')}
                    </Button>
                    <Button variant="outline" onClick={() => selectedLayerId && mutate(moveLayerInComposition(composition, activeSceneIndex, selectedLayerId, 1))}>
                      {props.t('down')}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="muted">{props.t('selectLayerHint')}</p>
              )}
            </Card>
          </aside>
        </div>
      )}
    </section>
  )
}

function layerTypeLabel(type: VideoLayerType | string | undefined, t: Translator) {
  if (type === 'text') return t('text')
  if (type === 'rect') return t('block')
  if (type === 'ellipse') return t('circle')
  if (type === 'image') return t('image')
  if (type === 'video') return t('filterVideo')
  return t('layer')
}

function templateGroupLabel(group: string, t: Translator) {
  if (group === 'Entrance') return t('templateEntrance')
  if (group === 'Emphasis') return t('templateEmphasis')
  if (group === 'Attention') return t('templateAttention')
  if (group === 'Exit') return t('templateExit')
  return group
}
