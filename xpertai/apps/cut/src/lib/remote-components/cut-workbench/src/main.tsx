import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input,
  Progress, ResizableHandle, ResizablePanel, ResizablePanelGroup, ScrollArea, Slider, Switch, Tabs, TabsContent,
  TabsList, TabsTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import {
  Bookmark, Captions, Check, ChevronDown, ClipboardCopy, ClipboardPaste, CopyPlus, Download, Eye, EyeOff,
  Film, Image, Layers3, ListChecks, Magnet, Maximize2, Music2, PanelLeftClose, PanelRightClose, Pause, Play, Plus, Redo2,
  RotateCcw, Save, Scissors, Settings2, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Sticker, Trash2,
  Type, Undo2, Unlink, Upload, Volume2, VolumeX, WandSparkles, Waves, ZoomIn, ZoomOut
} from 'lucide-react'
import { parseCutHostEvent } from '../../../cut-host-event'
import {
  assertCutAssistantContextSetSucceeded,
  createCutAssistantContextClearPayload,
  createCutAssistantContextSetPayload
} from '../../../cut-assistant-context'
import { CUT_ASSISTANT_CONTEXT_SET_COMMAND } from '../../../constants'
import {
  moveCutTransform, resizeCutTransform, rotateCutTransform, type CutResizeHandle
} from '../../../cut-canvas-transform'
import { computeCutWaveform } from '../../../cut-waveform'
import { MAX_CUT_PROJECT_DURATION, restoreClipSourceDuration, shouldMountPreviewMedia, shouldSeekPreviewMedia } from '../../../cut-media-playback'
import {
  copyCutClips, duplicateCutClips, extractCutAudio, pasteCutClips, removeCutClips, splitCutClips,
  toggleCutBookmark, type CutClipboard
} from '../../../cut-editor-model'
import { clipStartFromDrag } from '../../../cut-timeline'
import { canExportCutVideo, exportCutVideo } from './cut-exporter'
import { createCutTranslator, type CutMessageKey } from './cut-i18n'
import { probeMediaDuration, probeMediaMetadata } from './cut-media-metadata'
import { fitCutStage } from '../../../cut-media-layout'
import {
  DEFAULT_CUT_EXPORT_SETTINGS,
  cutExportProfile,
  type CutExportSettings
} from '../../../cut-export-settings'
import {
  CUT_BROWSER_MEDIA_ANALYZER_VERSION,
  analyzeCutAudioActivity,
  analyzeCutVideoShots,
  type CutBrowserMediaEvidenceSegment
} from './cut-media-analysis'
import {
  CUT_LOCAL_TRANSCRIPTION_LANGUAGES,
  CUT_LOCAL_TRANSCRIPTION_MODELS,
  createCutLocalTranscriptionTask,
  decodeCutLocalTranscriptionAudio,
  type CutLocalTranscriptionProgress
} from './cut-local-transcription'
import { cutDebug } from './debug'
import type { AnalysisJobSummary, CaptionCue, CaptionDraftPage, CutClip, CutDocument, CutTrack, CutViewData, EditProposalReview, MediaEvidenceSummary, MediaSummary, ProjectDetail } from './cut-types'
import {
  errorText, executeAction, executeFileAction, invokeClientCommand, isRemoteObject, notify, reportResize,
  requestData, requestFileAccess, responsePayload, startRemoteBridge, type RemoteContext, type RemoteValue
} from './runtime'
import './app.css'

const h = React.createElement
const EMPTY: CutViewData = {
  projects: { items: [], total: 0, page: 1, pageSize: 20 }, detail: null, captionDrafts: [], analysisJobs: [], mediaSegments: [], editProposals: [],
  renderCapability: { available: false, backend: 'sandbox-job', reason: 'LOADING', message: 'Checking Sandbox Runtime…', limits: { maxVariants: 5, maxDurationSeconds: 600, maxFrames: 18_000, maxWidth: 3840, maxHeight: 2160, maxFps: 60, maxMediaBytes: 4 * 1024 * 1024 * 1024 } }
}
const TRACK_GUTTER = 132
const MIN_CLIP_DURATION = 0.1
const HISTORY_LIMIT = 50
const CUT_MEDIA_DRAG_TYPE = 'application/x-xpert-cut-media'
const COLOR_PRESETS = ['#111827', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#f8fafc']
const STICKER_PRESETS = ['✨', '🔥', '❤️', '👍', '🎉', '⭐', '💡', '🚀', '✅', '💬', '📍', '🎬']
const DEFAULT_EFFECTS = { brightness: 1, contrast: 1, saturation: 1, blur: 0, grayscale: 0, sepia: 0 }
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const
const MASK_SHAPES = ['none', 'rectangle', 'circle', 'rounded'] as const
const TRANSITION_TYPES = ['fade', 'slide', 'zoom'] as const
const FILE_ACCESS_REFRESH_WINDOW_MS = 5 * 60 * 1_000
const FILE_ACCESS_REFRESH_RETRY_MS = 30_000
const FILE_ACCESS_CONCURRENCY = 4

type Translator = (key: CutMessageKey) => string
type DragMode = 'move' | 'trim-start' | 'trim-end'
type DragSession = {
  mode: DragMode
  clipId: string
  startX: number
  initialStart: number
  initialDuration: number
  initialTrimIn: number
  initialTrimOut: number
  projectDuration: number
  pixelsPerSecond: number
  snapping: boolean
  ripple: boolean
  snapPoints: number[]
  original: CutDocument
  changed: boolean
}
type CanvasTransformMode = 'move' | 'rotate' | CutResizeHandle
type CanvasTransformSession = {
  mode: CanvasTransformMode
  pointerId: number
  startClientX: number
  startClientY: number
  startAngle: number
  centerClientX: number
  centerClientY: number
  scaleX: number
  scaleY: number
  startTransform: NonNullable<CutClip['transform']>
  changed: boolean
}
type MediaAccessGrant = {
  url: string
  expiresAt: string
  fileName: string
  mimeType: string
  size?: number
}
type ExportMode = 'browser' | 'background'

function App() {
  const [context, setContext] = React.useState<RemoteContext | null>(null)
  const [data, setData] = React.useState<CutViewData>(EMPTY)
  const [documentDraft, setDocumentDraft] = React.useState<CutDocument | null>(null)
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const [selectedClipId, setSelectedClipId] = React.useState<string | null>(null)
  const [selectedClipIds, setSelectedClipIds] = React.useState<string[]>([])
  const [playhead, setPlayhead] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [pixelsPerSecond, setPixelsPerSecond] = React.useState(48)
  const [previewZoom, setPreviewZoom] = React.useState('fit')
  const [snappingEnabled, setSnappingEnabled] = React.useState(true)
  const [rippleEditingEnabled, setRippleEditingEnabled] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [remotePending, setRemotePending] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [restoringDuration, setRestoringDuration] = React.useState(false)
  const [status, setStatus] = React.useState('Connecting…')
  const [exportProgress, setExportProgress] = React.useState<number | null>(null)
  const [exportDialogOpen, setExportDialogOpen] = React.useState(false)
  const [exportMode, setExportMode] = React.useState<ExportMode>('browser')
  const [exportSettings, setExportSettings] = React.useState<CutExportSettings>(() => ({ ...DEFAULT_CUT_EXPORT_SETTINGS }))
  const [libraryTab, setLibraryTab] = React.useState('media')
  const [downloadingExportId, setDownloadingExportId] = React.useState<string | null>(null)
  const [mediaState, setMediaState] = React.useState('idle')
  const [mediaSearch, setMediaSearch] = React.useState('')
  const [mediaAnalysisAssetId, setMediaAnalysisAssetId] = React.useState('')
  const [mediaAnalysisProgress, setMediaAnalysisProgress] = React.useState<{ progress: number; message: string } | null>(null)
  const [captionText, setCaptionText] = React.useState('')
  const [captionReview, setCaptionReview] = React.useState<CaptionDraftPage | null>(null)
  const [proposalReview, setProposalReview] = React.useState<EditProposalReview | null>(null)
  const [localTranscriptionAssetId, setLocalTranscriptionAssetId] = React.useState('')
  const [localTranscriptionModel, setLocalTranscriptionModel] = React.useState<string>(CUT_LOCAL_TRANSCRIPTION_MODELS[0].id)
  const [localTranscriptionLanguage, setLocalTranscriptionLanguage] = React.useState<string>('auto')
  const [localTranscriptionProgress, setLocalTranscriptionProgress] = React.useState<CutLocalTranscriptionProgress | null>(null)
  const [dropTrackId, setDropTrackId] = React.useState<string | null>(null)
  const [undoStack, setUndoStack] = React.useState<CutDocument[]>([])
  const [redoStack, setRedoStack] = React.useState<CutDocument[]>([])
  const [hasClipboard, setHasClipboard] = React.useState(false)
  const uploadRef = React.useRef<HTMLInputElement | null>(null)
  const subtitleUploadRef = React.useRef<HTMLInputElement | null>(null)
  const stageShellRef = React.useRef<HTMLDivElement | null>(null)
  const exportCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const dirtyRef = React.useRef(false)
  const selectedProjectRef = React.useRef<string | null>(null)
  const playheadRef = React.useRef(0)
  const playbackAnchorRef = React.useRef({ wallTime: 0, playhead: 0 })
  const clipboardRef = React.useRef<CutClipboard | null>(null)
  const loadRef = React.useRef<(projectId?: string | null, force?: boolean) => Promise<void>>(async () => undefined)
  const dragRef = React.useRef<DragSession | null>(null)
  const localTranscriptionCancelRef = React.useRef<(() => void) | null>(null)
  const mediaAnalysisCancelRef = React.useRef<(() => void) | null>(null)
  const exportCancelRef = React.useRef<(() => void) | null>(null)
  const dataRef = React.useRef<CutViewData>(EMPTY)
  const mediaAccessGrantsRef = React.useRef(new Map<string, MediaAccessGrant>())
  const mediaAccessFailuresRef = React.useRef(new Set<string>())
  const t = React.useMemo(() => createCutTranslator(context?.locale), [context?.locale])

  React.useEffect(() => { dirtyRef.current = dirty }, [dirty])
  React.useEffect(() => { dataRef.current = data }, [data])
  React.useEffect(() => { selectedProjectRef.current = selectedProjectId }, [selectedProjectId])
  React.useEffect(() => { playheadRef.current = playhead }, [playhead])
  React.useEffect(() => () => {
    localTranscriptionCancelRef.current?.()
    mediaAnalysisCancelRef.current?.()
    exportCancelRef.current?.()
  }, [])

  const hydrateMediaAccess = React.useCallback(async (detail: ProjectDetail | null, forceIds = new Set<string>()) => {
    const projectId = detail?.item.id
    if (!detail || !projectId) return detail
    const assets = detail.media.filter((asset): asset is MediaSummary & { id: string } => Boolean(asset.id))
    await mapWithConcurrency(assets, FILE_ACCESS_CONCURRENCY, async (asset) => {
      const cacheKey = `${projectId}:${asset.id}`
      const cached = mediaAccessGrantsRef.current.get(cacheKey)
      if (!forceIds.has(asset.id) && cached && Date.parse(cached.expiresAt) > Date.now() + FILE_ACCESS_REFRESH_WINDOW_MS) return
      try {
        const payload = responsePayload(await requestFileAccess(asset.id, projectId, 'preview'))
        const grant = parseMediaAccessGrant(payload)
        mediaAccessGrantsRef.current.set(cacheKey, grant)
      } catch (error) {
        cutDebug.warn(`media.file-access-failed: ${asset.originalName}: ${errorText(error)}`)
      }
    })
    const urls = new Map<string, string>()
    for (const asset of assets) {
      const grant = mediaAccessGrantsRef.current.get(`${projectId}:${asset.id}`)
      if (grant) urls.set(asset.id, grant.url)
    }
    return {
      ...detail,
      media: detail.media.map((asset) => asset.id && urls.has(asset.id) ? { ...asset, previewUrl: urls.get(asset.id)! } : asset),
      document: applyMediaPreviewUrls(detail.document, urls)
    }
  }, [])

  const syncDetail = React.useCallback((detail: ProjectDetail | null) => {
    if (!detail) {
      setDocumentDraft(null)
      setSelectedClipId(null)
      setSelectedClipIds([])
      setCaptionReview(null)
      setProposalReview(null)
      return
    }
    setCaptionReview((current) => current?.item.projectId === detail.item.id ? current : null)
    setProposalReview((current) => current?.item.projectId === detail.item.id ? current : null)
    setSelectedProjectId(detail.item.id ?? null)
    setDocumentDraft(structuredClone(detail.document))
    setSelectedClipId((current) => {
      const next = current && findClip(detail.document, current) ? current : firstClip(detail.document)?.id ?? null
      setSelectedClipIds(next ? [next] : [])
      return next
    })
    setPlayhead(0)
    setUndoStack([])
    setRedoStack([])
    setDirty(false)
    setRemotePending(false)
  }, [])

  const load = React.useCallback(async (projectId?: string | null, force = false) => {
    setLoading(true)
    try {
      const id = projectId ?? selectedProjectRef.current
      const payload = responsePayload(await requestData({ page: 1, pageSize: 20, parameters: id ? { projectId: id } : {} }))
      const nextData = coerceViewData(payload)
      const detail = await hydrateMediaAccess(nextData.detail)
      const mediaUrls = mediaPreviewUrls(detail)
      const next = { ...nextData, detail, mediaSegments: applyEvidencePreviewUrls(nextData.mediaSegments, mediaUrls) }
      setData(next)
      if (force || !dirtyRef.current) syncDetail(next.detail)
      else if (next.detail?.item.revision !== data.detail?.item.revision) setRemotePending(true)
      setStatus(t('ready'))
    } catch (error) {
      const message = errorText(error)
      setStatus(message)
      notify('error', message)
    } finally {
      setLoading(false)
      window.setTimeout(reportResize, 0)
    }
  }, [data.detail?.item.revision, hydrateMediaAccess, syncDetail, t])

  const refreshMediaAccess = React.useCallback(async (mediaAssetIds: string[]) => {
    const current = dataRef.current
    if (!current.detail || !mediaAssetIds.length) return
    const nextDetail = await hydrateMediaAccess(current.detail, new Set(mediaAssetIds))
    if (!nextDetail || dataRef.current.detail?.item.id !== nextDetail.item.id) return
    const urls = new Map(nextDetail.media.flatMap((asset) => asset.id && asset.previewUrl ? [[asset.id, asset.previewUrl] as const] : []))
    setData((value) => value.detail?.item.id === nextDetail.item.id ? { ...value, detail: nextDetail } : value)
    setDocumentDraft((document) => document ? applyMediaPreviewUrls(document, urls) : document)
  }, [hydrateMediaAccess])

  const handleMediaState = React.useCallback((state: string, mediaAssetId?: string, sourceUrl?: string) => {
    setMediaState(state)
    if (state !== 'error' || !mediaAssetId) return
    const failureKey = `${mediaAssetId}:${sourceUrl ?? ''}`
    if (mediaAccessFailuresRef.current.has(failureKey)) return
    mediaAccessFailuresRef.current.add(failureKey)
    void refreshMediaAccess([mediaAssetId])
  }, [refreshMediaAccess])

  React.useEffect(() => { loadRef.current = load }, [load])
  React.useEffect(() => {
    const detail = data.detail
    const projectId = detail?.item.id
    if (!detail || !projectId) return undefined
    const assetIds = detail.media.flatMap((asset) => asset.id ? [asset.id] : [])
    const expiries = assetIds.flatMap((id) => {
      const expiry = Date.parse(mediaAccessGrantsRef.current.get(`${projectId}:${id}`)?.expiresAt ?? '')
      return Number.isFinite(expiry) ? [expiry] : []
    })
    if (!expiries.length) return undefined
    const delay = Math.max(FILE_ACCESS_REFRESH_RETRY_MS, Math.min(...expiries) - Date.now() - FILE_ACCESS_REFRESH_WINDOW_MS)
    const timer = window.setTimeout(() => void refreshMediaAccess(assetIds), delay)
    return () => window.clearTimeout(timer)
  }, [data.detail, refreshMediaAccess])
  React.useEffect(() => {
    if (!data.analysisJobs.some((job) => job.executionMode === 'server' && (job.status === 'queued' || job.status === 'running'))) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const projectId = selectedProjectRef.current
        const payload = responsePayload(await requestData({ page: 1, pageSize: 20, parameters: projectId ? { projectId } : {} }))
        const next = coerceViewData(payload)
        setData((current) => ({
          ...current,
          analysisJobs: next.analysisJobs,
          renderCapability: next.renderCapability,
          detail: current.detail && next.detail ? { ...current.detail, exports: next.detail.exports, logs: next.detail.logs } : current.detail
        }))
      } catch {
        // Background polling is best-effort; the explicit Reload action remains authoritative.
      }
    }, 2_000)
    return () => window.clearTimeout(timer)
  }, [data.analysisJobs])
  React.useEffect(() => startRemoteBridge(
    (next) => { setContext(next); void loadRef.current(readInitialProjectId(next), true) },
    (event) => {
      if (!isRemoteObject(event)) return
      const parsed = parseCutHostEvent(event)
      const selectedProjectId = selectedProjectRef.current
      cutDebug.debug('host-event.normalized', {
        matches: parsed.matches, toolName: parsed.toolName, projectId: parsed.projectId,
        revision: parsed.revision, dirty: dirtyRef.current
      })
      if (!parsed.matches) return
      if (parsed.projectId && selectedProjectId && parsed.projectId !== selectedProjectId) {
        cutDebug.debug('host-event.refresh-skipped', {
          reason: 'different-project', projectId: parsed.projectId, selectedProjectId
        })
        return
      }
      if (dirtyRef.current) {
        setRemotePending(true)
        setStatus(t('remoteWaiting'))
        cutDebug.info('host-event.refresh-skipped', { reason: 'dirty-local-state', toolName: parsed.toolName })
      } else void loadRef.current(parsed.projectId ?? selectedProjectId, true)
    }
  ), [t])

  const duration = documentDraft?.settings.durationSeconds ?? 30
  const localTranscriptionMedia = data.detail?.media.filter((asset) => asset.id && asset.previewUrl && (asset.mimeType.startsWith('audio/') || asset.mimeType.startsWith('video/'))) ?? []
  const selectedClip = documentDraft && selectedClipId ? findClip(documentDraft, selectedClipId) : null
  const referencedMediaIds = new Set(documentDraft?.tracks.flatMap((track) => track.clips.map((clip) => clip.mediaAssetId).filter((id): id is string => Boolean(id))) ?? [])
  const headlessInputBytes = (data.detail?.media ?? []).reduce((total, asset) => total + (asset.id && referencedMediaIds.has(asset.id) ? asset.size : 0), 0)
  const headlessInputLimit = data.renderCapability.limits.maxMediaBytes
  const headlessMediaOversize = headlessInputBytes > headlessInputLimit
  const headlessMediaMessage = headlessMediaOversize
    ? `${t('headlessMediaTooLarge')} (${formatBytes(headlessInputBytes)} > ${formatBytes(headlessInputLimit)}) ${t('headlessUseLocal')}`
    : null
  const headlessReady = data.renderCapability.available && !headlessMediaOversize
  const bookmarkAtPlayhead = documentDraft?.bookmarks?.some((bookmark) => Math.abs(bookmark.time - playhead) <= 0.05) ?? false
  const selectClip = React.useCallback((clipId: string, additive = false) => {
    if (!additive) {
      setSelectedClipIds([clipId])
      setSelectedClipId(clipId)
      return
    }
    const next = selectedClipIds.includes(clipId)
      ? selectedClipIds.filter((id) => id !== clipId)
      : [...selectedClipIds, clipId]
    setSelectedClipIds(next)
    setSelectedClipId(next.includes(clipId) ? clipId : next[next.length - 1] ?? null)
  }, [selectedClipIds])

  const selectOnly = React.useCallback((clipId: string) => selectClip(clipId, false), [selectClip])

  React.useEffect(() => {
    if (localTranscriptionMedia.some((asset) => asset.id === localTranscriptionAssetId)) return
    setLocalTranscriptionAssetId(localTranscriptionMedia[0]?.id ?? '')
  }, [localTranscriptionAssetId, localTranscriptionMedia])

  React.useEffect(() => {
    if (localTranscriptionMedia.some((asset) => asset.id === mediaAnalysisAssetId)) return
    setMediaAnalysisAssetId(localTranscriptionMedia[0]?.id ?? '')
  }, [localTranscriptionMedia, mediaAnalysisAssetId])

  React.useEffect(() => {
    if (!isPlaying) return undefined
    playbackAnchorRef.current = { wallTime: performance.now(), playhead: playheadRef.current }
    let frame = 0
    const tick = (now: number) => {
      const next = playbackAnchorRef.current.playhead + (now - playbackAnchorRef.current.wallTime) / 1000
      if (next >= duration) {
        setPlayhead(duration)
        playheadRef.current = duration
        setIsPlaying(false)
        return
      }
      setPlayhead(next)
      playheadRef.current = next
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, isPlaying])

  React.useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      drag.changed = true
      setDocumentDraft(applyDragPreview(drag, event.clientX))
    }
    const up = () => {
      const drag = dragRef.current
      if (drag?.changed) {
        setUndoStack((current) => [...current, drag.original].slice(-HISTORY_LIMIT))
        setRedoStack([])
        setDirty(true)
      }
      dragRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  React.useEffect(() => {
    if (!context) return undefined
    const project = data.detail?.item
    const payload = project?.id
      ? createCutAssistantContextSetPayload({
          projectId: project.id,
          title: project.title,
          status: project.status,
          revision: project.revision,
          currentVersionNumber: project.currentVersionNumber,
          selectedClipId,
          dirty
        })
      : createCutAssistantContextClearPayload()
    let active = true

    void invokeClientCommand(CUT_ASSISTANT_CONTEXT_SET_COMMAND, payload)
      .then((response) => {
        assertCutAssistantContextSetSucceeded(responsePayload(response))
        if (active) {
          cutDebug.debug('assistant-context.synced', {
            projectId: project?.id ?? null,
            revision: project?.revision ?? null,
            cleared: !project?.id
          })
        }
      })
      .catch((error) => {
        if (active) {
          cutDebug.warn('assistant-context.sync-failed', { message: errorText(error) })
        }
      })

    return () => {
      active = false
    }
  }, [
    context,
    data.detail?.item.currentVersionNumber,
    data.detail?.item.id,
    data.detail?.item.revision,
    data.detail?.item.status,
    data.detail?.item.title,
    dirty,
    selectedClipId
  ])

  const commitDraft = React.useCallback((update: (document: CutDocument) => CutDocument) => {
    setDocumentDraft((current) => {
      if (!current) return current
      const next = update(current)
      if (next === current) return current
      setUndoStack((history) => [...history, structuredClone(current)].slice(-HISTORY_LIMIT))
      setRedoStack([])
      setDirty(true)
      return next
    })
  }, [])

  const seek = React.useCallback((time: number) => {
    const next = roundTime(clamp(time, 0, duration))
    setPlayhead(next)
    playheadRef.current = next
    playbackAnchorRef.current = { wallTime: performance.now(), playhead: next }
  }, [duration])

  const togglePlayback = React.useCallback(() => {
    if (playheadRef.current >= duration) seek(0)
    playbackAnchorRef.current = { wallTime: performance.now(), playhead: playheadRef.current }
    const nextPlaying = !isPlaying
    const mediaElements = stageShellRef.current?.querySelectorAll<HTMLMediaElement>('video,audio') ?? []
    if (nextPlaying) resumePreviewCapturedAudio()
    for (const media of mediaElements) {
      if (nextPlaying) void media.play().catch((error) => cutDebug.warn(`preview.play-failed: ${errorText(error)}`))
      else media.pause()
    }
    setIsPlaying(nextPlaying)
  }, [duration, isPlaying, seek])

  const createProject = async () => {
    const title = window.prompt(t('projectTitle'), t('defaultProjectTitle'))?.trim()
    if (!title) return
    setSaving(true)
    try {
      const payload = responsePayload(await executeAction('cut_create_project', null, {
        title, durationSeconds: 30, changeSummary: t('createdSummary')
      }))
      const created = coerceDetail(payload)
      await load(created?.item.id ?? null, true)
      notify('success', t('createSuccess'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const save = React.useCallback(async () => {
    const detail = data.detail
    if (!detail?.item.id || !documentDraft) return
    setSaving(true)
    try {
      const payload = responsePayload(await executeAction('cut_save_project', detail.item.id, {
        projectId: detail.item.id, document: documentDraft as RemoteValue, baseRevision: detail.item.revision,
        changeSummary: t('savedSummary')
      }))
      const mutation = isRemoteObject(payload) ? payload : null
      const nextDocument = mutation && isRemoteObject(mutation.document) ? mutation.document as RemoteValue : null
      const nextProject = mutation && isRemoteObject(mutation.project) ? mutation.project : null
      if (nextDocument) setDocumentDraft(nextDocument as CutDocument)
      if (nextProject && typeof nextProject.revision === 'number') {
        setData((current) => current.detail ? ({ ...current, detail: {
          ...current.detail,
          item: { ...current.detail.item, revision: nextProject.revision as number },
          document: (nextDocument as CutDocument) ?? current.detail.document
        } }) : current)
      }
      setDirty(false)
      notify('success', t('saveSuccess'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }, [data.detail, documentDraft, t])

  const upload = async (file: File) => {
    if (!data.detail?.item.id) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    setSaving(true)
    try {
      const mediaKind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null
      setStatus(mediaKind ? t('readingMediaMetadata') : t('loading'))
      const metadata = mediaKind ? await probeMediaMetadata(file, mediaKind) : {}
      await executeFileAction('cut_upload_media_file', data.detail.item.id, {
        projectId: data.detail.item.id, baseRevision: data.detail.item.revision, ...metadata,
        changeSummary: `${t('upload')} ${file.name}.`
      }, file)
      await load(data.detail.item.id, true)
      notify('success', t('uploadSuccess'))
    } catch (error) {
      const message = errorText(error) || t('sourceDurationUnavailable')
      setStatus(message)
      notify('error', message)
    } finally { setSaving(false) }
  }

  const loadCaptionDraft = async (draftId: string, page = 1) => {
    const projectId = data.detail?.item.id
    if (!projectId) return
    try {
      const payload = responsePayload(await executeAction('cut_get_caption_draft', projectId, {
        projectId, draftId, page, pageSize: 200
      }))
      const parsedPage = coerceCaptionDraftPage(payload)
      if (!parsedPage) throw new Error('Caption draft response is invalid.')
      setCaptionReview(parsedPage)
    } catch (error) { notify('error', errorText(error)) }
  }

  const loadEditProposal = async (proposalId: string) => {
    const projectId = data.detail?.item.id
    if (!projectId) return
    try {
      const payload = responsePayload(await executeAction('cut_get_edit_proposal', projectId, { projectId, proposalId }))
      const parsed = coerceEditProposalReview(payload)
      if (!parsed) throw new Error('Cut edit proposal response is invalid.')
      setProposalReview(applyProposalPreviewUrls(parsed, mediaPreviewUrls(data.detail)))
    } catch (error) { notify('error', errorText(error)) }
  }

  const setProposalItemEnabled = async (itemId: string, enabled: boolean) => {
    const projectId = data.detail?.item.id
    const review = proposalReview
    if (!projectId || !review.item.id || review.item.status !== 'draft') return
    setSaving(true)
    try {
      const payload = responsePayload(await executeAction('cut_update_edit_proposal', projectId, {
        projectId,
        proposalId: review.item.id,
        baseProposalRevision: review.item.revision,
        itemUpdates: [{ itemId, enabled }] as unknown as RemoteValue,
        changeSummary: enabled ? 'Enabled one Cut proposal item in Workbench.' : 'Disabled one Cut proposal item in Workbench.'
      }))
      const parsed = coerceEditProposalReview(payload)
      if (!parsed) throw new Error('Cut edit proposal review response is invalid.')
      const proposal = applyProposalPreviewUrls(parsed, mediaPreviewUrls(data.detail))
      setProposalReview(proposal)
      setData((current) => ({ ...current, editProposals: current.editProposals.map((item) => item.id === proposal.item.id ? proposal.item : item) }))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const applyEditProposal = async () => {
    const project = data.detail?.item
    const review = proposalReview
    if (!project?.id || !review?.item.id) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    setSaving(true)
    try {
      await executeAction('cut_apply_edit_proposal', project.id, {
        projectId: project.id,
        proposalId: review.item.id,
        baseRevision: project.revision,
        baseProposalRevision: review.item.revision,
        changeSummary: 'Applied reviewed Cut rough-cut proposal from Workbench.'
      })
      setProposalReview(null)
      await load(project.id, true)
      notify('success', t('proposalApplied'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const rejectEditProposal = async () => {
    const projectId = data.detail?.item.id
    const review = proposalReview
    if (!projectId || !review?.item.id) return
    setSaving(true)
    try {
      await executeAction('cut_reject_edit_proposal', projectId, {
        projectId,
        proposalId: review.item.id,
        baseProposalRevision: review.item.revision,
        changeSummary: 'Rejected Cut rough-cut proposal from Workbench.'
      })
      setProposalReview(null)
      await load(projectId, true)
      notify('info', t('proposalRejected'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const revertEditProposal = async () => {
    const project = data.detail?.item
    const review = proposalReview
    if (!project?.id || !review?.item.id) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    setSaving(true)
    try {
      await executeAction('cut_revert_edit_proposal', project.id, {
        projectId: project.id,
        proposalId: review.item.id,
        baseRevision: project.revision,
        changeSummary: 'Reverted applied Cut rough-cut proposal from Workbench.'
      })
      setProposalReview(null)
      await load(project.id, true)
      notify('success', t('proposalReverted'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const importSubtitles = async (file: File) => {
    const projectId = data.detail?.item.id
    if (!projectId) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    setSaving(true)
    try {
      const payload = responsePayload(await executeFileAction('cut_import_subtitle_file', projectId, {
        projectId,
        baseRevision: data.detail!.item.revision,
        language: navigator.language.split('-')[0] || 'und',
        changeSummary: `Imported ${file.name} as a reviewable caption draft.`
      }, file))
      const draftId = isRemoteObject(payload) && typeof payload.draftId === 'string' ? payload.draftId : null
      await load(projectId, true)
      if (draftId) await loadCaptionDraft(draftId)
      notify('success', t('captionImported'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const cancelAnalysisJob = async (jobId: string) => {
    const projectId = data.detail?.item.id
    if (!projectId) return
    setSaving(true)
    try {
      await executeAction('cut_cancel_analysis_job', projectId, {
        projectId,
        jobId,
        changeSummary: 'Cancelled Cut analysis job from Workbench.'
      })
      await load(projectId, true)
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const openExportConfiguration = () => {
    setExportDialogOpen(true)
  }

  const queueHeadlessExport = async (settings: CutExportSettings) => {
    const project = data.detail?.item
    if (!project?.id || !documentDraft) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    if (headlessMediaMessage) {
      notify('error', headlessMediaMessage)
      return
    }
    if (!data.renderCapability.available) {
      notify('error', data.renderCapability.message ?? t('headlessUnavailable'))
      return
    }
    setSaving(true)
    try {
      await executeAction('cut_start_headless_export', project.id, {
        projectId: project.id,
        baseRevision: project.revision,
        variants: [{ name: `${documentDraft.settings.width}x${documentDraft.settings.height}` }],
        exportSettings: { format: settings.format, quality: settings.quality, includeAudio: settings.includeAudio },
        changeSummary: `Queued a revision-bound Cut ${settings.format.toUpperCase()} background export from Workbench.`
      })
      await load(project.id, true)
      setExportDialogOpen(false)
      setLibraryTab('tasks')
      notify('success', t('headlessQueued'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const runLocalTranscription = async () => {
    const project = data.detail?.item
    const asset = localTranscriptionMedia.find((item) => item.id === localTranscriptionAssetId)
    if (!project?.id || !asset?.id || !asset.previewUrl || !documentDraft) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    const controller = new AbortController()
    let task: ReturnType<typeof createCutLocalTranscriptionTask> | null = null
    localTranscriptionCancelRef.current = () => {
      controller.abort()
      task?.cancel()
    }
    setLocalTranscriptionProgress({ phase: 'audio', progress: 1, message: t('localPreparing') })
    try {
      const decoded = await decodeCutLocalTranscriptionAudio({
        url: asset.previewUrl,
        maxDuration: asset.duration ?? documentDraft.settings.durationSeconds,
        signal: controller.signal,
        onProgress: setLocalTranscriptionProgress
      })
      task = createCutLocalTranscriptionTask({
        audio: decoded.audio,
        model: localTranscriptionModel,
        language: localTranscriptionLanguage,
        // The packaged ORT engine is the deterministic WASM build. WebGPU remains opt-in only after a JSEP gate.
        preferWebGpu: false,
        onProgress: setLocalTranscriptionProgress
      })
      const result = await task.promise
      setLocalTranscriptionProgress({
        phase: 'persist', progress: 99, message: t('localSavingDraft'), device: result.device
      })
      const payload = responsePayload(await executeAction('cut_import_local_transcription', project.id, {
        projectId: project.id,
        mediaAssetId: asset.id,
        baseRevision: project.revision,
        language: result.language === 'auto' ? 'und' : result.language,
        model: result.model,
        device: result.device,
        duration: result.duration,
        segments: result.segments as unknown as RemoteValue,
        changeSummary: `Saved local ${result.model} transcription as a reviewable caption draft.`
      }))
      const draftId = isRemoteObject(payload) && typeof payload.draftId === 'string' ? payload.draftId : null
      await load(project.id, true)
      if (draftId) await loadCaptionDraft(draftId)
      setLocalTranscriptionProgress(null)
      notify('success', t('localComplete'))
    } catch (error) {
      if (isAbortError(error)) {
        setLocalTranscriptionProgress(null)
        notify('info', t('localCancelled'))
      } else {
        const message = errorText(error)
        setLocalTranscriptionProgress({ phase: 'transcribe', progress: 0, message })
        notify('error', message)
      }
    } finally {
      localTranscriptionCancelRef.current = null
    }
  }

  const cancelLocalTranscription = () => localTranscriptionCancelRef.current?.()

  const runLocalMediaAnalysis = async () => {
    const project = data.detail?.item
    const asset = localTranscriptionMedia.find((item) => item.id === mediaAnalysisAssetId)
    if (!project?.id || !asset?.id || !asset.previewUrl || !documentDraft) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    const controller = new AbortController()
    mediaAnalysisCancelRef.current = () => controller.abort()
    setMediaAnalysisProgress({ progress: 1, message: t('mediaAnalysisPreparing') })
    try {
      const segments: CutBrowserMediaEvidenceSegment[] = []
      let analyzedDuration = asset.duration ?? documentDraft.settings.durationSeconds
      try {
        const decoded = await decodeCutLocalTranscriptionAudio({
          url: asset.previewUrl,
          maxDuration: asset.duration ?? documentDraft.settings.durationSeconds,
          signal: controller.signal,
          onProgress: (progress) => setMediaAnalysisProgress({
            progress: Math.min(35, Math.max(2, Math.round(progress.progress * 3.5))),
            message: t('mediaAnalysisAudio')
          })
        })
        analyzedDuration = decoded.duration
        segments.push(...analyzeCutAudioActivity({
          mediaAssetId: asset.id,
          audio: decoded.audio,
          sampleRate: 16_000,
          duration: decoded.duration
        }))
      } catch (error) {
        if (isAbortError(error)) throw error
        if (asset.mimeType.startsWith('audio/')) throw error
        cutDebug.info('media-analysis.audio-skipped', { mediaAssetId: asset.id, reason: errorText(error) })
      }
      if (asset.mimeType.startsWith('video/')) {
        const shots = await analyzeCutVideoShots({
          mediaAssetId: asset.id,
          url: asset.previewUrl,
          maxDuration: asset.duration ?? documentDraft.settings.durationSeconds,
          signal: controller.signal,
          onProgress: (progress, message) => setMediaAnalysisProgress({ progress: 35 + Math.round(progress * 0.55), message })
        })
        analyzedDuration = shots.duration
        segments.push(...shots.segments)
      }
      if (!segments.length) throw new Error(t('mediaAnalysisEmpty'))
      setMediaAnalysisProgress({ progress: 95, message: t('mediaAnalysisSaving') })
      await executeAction('cut_import_local_media_analysis', project.id, {
        projectId: project.id,
        mediaAssetId: asset.id,
        baseRevision: project.revision,
        analyzerVersion: CUT_BROWSER_MEDIA_ANALYZER_VERSION,
        duration: analyzedDuration,
        segments: segments as unknown as RemoteValue,
        changeSummary: `Indexed ${segments.length} browser media evidence segments for Agent search.`
      })
      await load(project.id, true)
      setMediaAnalysisProgress(null)
      notify('success', t('mediaAnalysisComplete'))
    } catch (error) {
      if (isAbortError(error)) {
        setMediaAnalysisProgress(null)
        notify('info', t('mediaAnalysisCancelled'))
      } else {
        const message = errorText(error)
        setMediaAnalysisProgress({ progress: 0, message })
        notify('error', message)
      }
    } finally {
      mediaAnalysisCancelRef.current = null
    }
  }

  const runCaptionEdit = async (operation: RemoteValue) => {
    const projectId = data.detail?.item.id
    const review = captionReview
    if (!projectId || !review?.item.id || review.item.status !== 'draft') return
    try {
      await executeAction('cut_update_caption_draft', projectId, {
        projectId,
        draftId: review.item.id,
        baseRevision: data.detail!.item.revision,
        baseDraftRevision: review.item.revision,
        operation,
        changeSummary: 'Updated caption draft from Cut Workbench.'
      })
      await loadCaptionDraft(review.item.id)
    } catch (error) { notify('error', errorText(error)) }
  }

  const commitCaptionReview = async () => {
    const projectId = data.detail?.item.id
    const review = captionReview
    if (!projectId || !review?.item.id || review.item.status !== 'draft') return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    setSaving(true)
    try {
      await executeAction('cut_commit_caption_draft', projectId, {
        projectId,
        draftId: review.item.id,
        baseRevision: data.detail!.item.revision,
        baseDraftRevision: review.item.revision,
        changeSummary: 'Committed reviewed captions from Cut Workbench.'
      })
      setCaptionReview(null)
      await load(projectId, true)
      notify('success', t('captionCommitted'))
    } catch (error) { notify('error', errorText(error)) } finally { setSaving(false) }
  }

  const updateCaptionCueLocal = (captionId: string, patch: Partial<CaptionCue>) => {
    setCaptionReview((current) => current ? ({
      ...current,
      captions: current.captions.map((caption) => caption.id === captionId ? { ...caption, ...patch } : caption)
    }) : current)
  }

  const finalize = async () => {
    if (!data.detail?.item.id) return
    if (dirtyRef.current) {
      notify('error', t('saveFirst'))
      return
    }
    try {
      await executeAction('cut_finalize_version', data.detail.item.id, {
        projectId: data.detail.item.id, baseRevision: data.detail.item.revision, changeSummary: t('finalizedSummary')
      })
      await load(data.detail.item.id, true)
      notify('success', t('finalizeSuccess'))
    } catch (error) { notify('error', errorText(error)) }
  }

  const exportVideo = async (settings: CutExportSettings) => {
    if (!data.detail?.item.id || !documentDraft || !exportCanvasRef.current) return
    const profile = cutExportProfile(settings)
    const controller = new AbortController()
    exportCancelRef.current = () => controller.abort()
    setSaving(true)
    setExportProgress(0)
    try {
      if (!await canExportCutVideo(settings, documentDraft.settings.width, documentDraft.settings.height)) throw new Error(t('exportUnsupported'))
      const blob = await exportCutVideo(exportCanvasRef.current, documentDraft, settings, setExportProgress, controller.signal)
      const file = new File([blob], `${safeFileName(data.detail.item.title)}.${profile.extension}`, { type: profile.mimeType })
      await executeFileAction('cut_save_export_file', data.detail.item.id, {
        projectId: data.detail.item.id,
        changeSummary: `${t('exportedSummary')} ${settings.format.toUpperCase()} · ${settings.quality} · ${settings.includeAudio ? 'audio' : 'silent'}.`
      }, file)
      await load(data.detail.item.id, true)
      setExportDialogOpen(false)
      setLibraryTab('tasks')
      notify('success', t('exportSuccess'))
    } catch (error) {
      notify(isAbortError(error) ? 'info' : 'error', isAbortError(error) ? t('exportCancelled') : errorText(error))
    } finally {
      exportCancelRef.current = null
      setSaving(false)
      setExportProgress(null)
    }
  }

  const submitExport = () => exportMode === 'background'
    ? queueHeadlessExport(exportSettings)
    : exportVideo(exportSettings)

  const downloadExport = async (exportId: string) => {
    const projectId = data.detail?.item.id
    if (!projectId) return
    setDownloadingExportId(exportId)
    try {
      const payload = responsePayload(await requestFileAccess(exportId, projectId, 'download'))
      const grant = parseMediaAccessGrant(payload)
      const anchor = document.createElement('a')
      anchor.href = grant.url
      anchor.download = grant.fileName
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      notify('error', errorText(error))
    } finally {
      setDownloadingExportId(null)
    }
  }

  const undo = React.useCallback(() => {
    const previous = undoStack[undoStack.length - 1]
    if (!previous || !documentDraft) return
    setUndoStack((current) => current.slice(0, -1))
    setRedoStack((current) => [structuredClone(documentDraft), ...current].slice(0, HISTORY_LIMIT))
    setDocumentDraft(structuredClone(previous))
    setDirty(true)
  }, [documentDraft, undoStack])

  const redo = React.useCallback(() => {
    const next = redoStack[0]
    if (!next || !documentDraft) return
    setRedoStack((current) => current.slice(1))
    setUndoStack((current) => [...current, structuredClone(documentDraft)].slice(-HISTORY_LIMIT))
    setDocumentDraft(structuredClone(next))
    setDirty(true)
  }, [documentDraft, redoStack])

  const deleteSelected = React.useCallback(() => {
    if (!selectedClipIds.length) return
    commitDraft((document) => removeCutClips(document, selectedClipIds))
    setSelectedClipId(null)
    setSelectedClipIds([])
  }, [commitDraft, selectedClipIds])

  const duplicateSelected = React.useCallback(() => {
    if (!documentDraft || !selectedClipIds.length) return
    const result = duplicateCutClips(documentDraft, selectedClipIds, makeId)
    if (!result.clipIds.length) return
    commitDraft(() => result.document)
    setSelectedClipIds(result.clipIds)
    setSelectedClipId(result.clipIds[result.clipIds.length - 1] ?? null)
  }, [commitDraft, documentDraft, selectedClipIds])

  const splitSelected = React.useCallback(() => {
    if (!documentDraft || !selectedClipIds.length) return
    const result = splitCutClips(documentDraft, selectedClipIds, roundTime(playheadRef.current), makeId)
    if (!result.clipIds.length) return
    commitDraft(() => result.document)
    setSelectedClipIds(result.clipIds)
    setSelectedClipId(result.clipIds[result.clipIds.length - 1] ?? null)
  }, [commitDraft, documentDraft, selectedClipIds])

  const copySelection = React.useCallback(() => {
    if (!documentDraft || !selectedClipIds.length) return
    clipboardRef.current = copyCutClips(documentDraft, selectedClipIds)
    if (clipboardRef.current) {
      setHasClipboard(true)
      notify('info', t('copied'))
    }
  }, [documentDraft, selectedClipIds, t])

  const pasteSelection = React.useCallback(() => {
    if (!documentDraft || !clipboardRef.current) return
    const result = pasteCutClips(documentDraft, clipboardRef.current, playheadRef.current, makeId)
    commitDraft(() => result.document)
    setSelectedClipIds(result.clipIds)
    setSelectedClipId(result.clipIds[result.clipIds.length - 1] ?? null)
    notify('success', t('pasted'))
  }, [commitDraft, documentDraft, t])

  const extractSelectedAudio = React.useCallback(() => {
    if (!documentDraft || selectedClip?.type !== 'video' || selectedClip.audioDetached) return
    const result = extractCutAudio(documentDraft, selectedClip.id, makeId)
    if (!result.clipId) return
    commitDraft(() => result.document)
    setSelectedClipIds([result.clipId])
    setSelectedClipId(result.clipId)
    notify('success', t('audioExtracted'))
  }, [commitDraft, documentDraft, selectedClip, t])

  const matchSelectedSourceDuration = React.useCallback(async () => {
    if (!selectedClip?.previewUrl || (selectedClip.type !== 'video' && selectedClip.type !== 'audio')) return
    setRestoringDuration(true)
    setStatus(t('matchingSourceDuration'))
    try {
      const sourceDuration = await probeMediaDuration(selectedClip.previewUrl, selectedClip.type)
      commitDraft((document) => restoreClipSourceDuration(document, selectedClip.id, sourceDuration))
      setStatus(t('ready'))
      notify('success', t('sourceDurationRestored'))
    } catch (error) {
      const message = errorText(error) || t('sourceDurationUnavailable')
      setStatus(message)
      notify('error', message)
    } finally {
      setRestoringDuration(false)
    }
  }, [commitDraft, selectedClip, t])

  const toggleBookmark = React.useCallback(() => {
    if (!documentDraft) return
    commitDraft((document) => toggleCutBookmark(document, playheadRef.current, makeId))
  }, [commitDraft, documentDraft])

  const trimSelectedAtPlayhead = React.useCallback((side: 'left' | 'right') => {
    if (!selectedClip || playheadRef.current <= selectedClip.start + 0.001 || playheadRef.current >= selectedClip.start + selectedClip.duration - 0.001) return
    const at = roundTime(playheadRef.current)
    commitDraft((document) => updateClip(document, selectedClip.id, (clip) => {
      if (side === 'left') {
        const delta = at - clip.start
        return { ...clip, start: at, duration: roundTime(clip.duration - delta), trimIn: roundTime(clip.trimIn + delta) }
      }
      const duration = roundTime(at - clip.start)
      return { ...clip, duration, trimOut: roundTime(clip.trimIn + duration) }
    }))
  }, [commitDraft, selectedClip])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.matches('input,textarea,select,[contenteditable="true"]') ?? false
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && !editing) { event.preventDefault(); copySelection(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && !editing) { event.preventDefault(); pasteSelection(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !editing && documentDraft) {
        event.preventDefault()
        const ids = documentDraft.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
        setSelectedClipIds(ids)
        setSelectedClipId(ids[ids.length - 1] ?? null)
        return
      }
      if (editing) return
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); return }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); splitSelected(); return }
      if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleBookmark(); return }
      if (event.key === 'Escape') { setSelectedClipIds([]); setSelectedClipId(null); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelection, deleteSelected, documentDraft, pasteSelection, redo, save, splitSelected, toggleBookmark, togglePlayback, undo])

  const updateSelectedClip = (update: (clip: CutClip) => CutClip) => {
    if (!selectedClipId) return
    commitDraft((document) => updateClip(document, selectedClipId, update))
  }

  const addTextClip = (preset: 'heading' | 'subtitle' | 'bodyText') => {
    if (!documentDraft) return
    const id = makeId()
    const settings = documentDraft.settings
    const width = preset === 'bodyText' ? settings.width * 0.56 : settings.width * 0.72
    const height = preset === 'heading' ? settings.height * 0.18 : settings.height * 0.12
    const clip: CutClip = {
      id, type: 'text', name: t(preset), text: t(preset), color: '#f8fafc', start: boundedStart(playheadRef.current, 5, settings.durationSeconds),
      duration: Math.min(5, settings.durationSeconds), trimIn: 0, trimOut: Math.min(5, settings.durationSeconds),
      transform: { x: (settings.width - width) / 2, y: (settings.height - height) / 2, width, height, rotation: 0, opacity: 1 }, fadeIn: 0.25, fadeOut: 0.25
    }
    commitDraft((document) => appendClip(document, clip, 'visual'))
    selectOnly(id)
    notify('success', t('textAdded'))
  }

  const addColorClip = (color: string) => {
    if (!documentDraft) return
    const id = makeId()
    const settings = documentDraft.settings
    const clip: CutClip = {
      id, type: 'color', name: t('solidColor'), color, start: boundedStart(playheadRef.current, 5, settings.durationSeconds),
      duration: Math.min(5, settings.durationSeconds), trimIn: 0, trimOut: Math.min(5, settings.durationSeconds),
      transform: { x: 0, y: 0, width: settings.width, height: settings.height, rotation: 0, opacity: 1 }
    }
    commitDraft((document) => appendClip(document, clip, 'visual'))
    selectOnly(id)
    notify('success', t('colorAdded'))
  }

  const addSticker = (sticker: string) => {
    if (!documentDraft) return
    const id = makeId()
    const settings = documentDraft.settings
    const size = Math.min(settings.width, settings.height) * 0.22
    const clip: CutClip = {
      id, type: 'text', name: `Sticker ${sticker}`, text: sticker, color: '#ffffff', fontSize: size * 0.8, fontWeight: 700, textAlign: 'center',
      start: boundedStart(playheadRef.current, 5, settings.durationSeconds), duration: Math.min(5, settings.durationSeconds),
      trimIn: 0, trimOut: Math.min(5, settings.durationSeconds), fadeIn: 0.15, fadeOut: 0.15,
      transform: { x: (settings.width - size) / 2, y: (settings.height - size) / 2, width: size, height: size, rotation: 0, opacity: 1 }
    }
    commitDraft((document) => appendClip(document, clip, 'visual'))
    selectOnly(id)
    notify('success', t('stickerAdded'))
  }

  const addCaption = () => {
    const content = captionText.trim()
    if (!documentDraft || !content) return
    const id = makeId()
    const settings = documentDraft.settings
    const width = settings.width * 0.78
    const height = settings.height * 0.14
    const clip: CutClip = {
      id, type: 'text', name: content, text: content, color: '#ffffff', fontSize: settings.height * 0.055, fontWeight: 650, textAlign: 'center',
      start: boundedStart(playheadRef.current, 4, settings.durationSeconds), duration: Math.min(4, settings.durationSeconds),
      trimIn: 0, trimOut: Math.min(4, settings.durationSeconds), fadeIn: 0.12, fadeOut: 0.12,
      transform: { x: (settings.width - width) / 2, y: settings.height * 0.76, width, height, rotation: 0, opacity: 1 }
    }
    commitDraft((document) => appendClip(document, clip, 'visual'))
    selectOnly(id)
    setCaptionText('')
  }

  const applyEffectPreset = (preset: 'none' | 'mono' | 'warm' | 'punch' | 'dream') => {
    if (!selectedClipId) return
    const effects: NonNullable<CutClip['effects']> = preset === 'mono'
      ? { ...DEFAULT_EFFECTS, grayscale: 1 }
      : preset === 'warm'
        ? { ...DEFAULT_EFFECTS, saturation: 1.18, contrast: 1.05, sepia: 0.18 }
        : preset === 'punch'
          ? { ...DEFAULT_EFFECTS, brightness: 1.04, contrast: 1.22, saturation: 1.3 }
          : preset === 'dream'
            ? { ...DEFAULT_EFFECTS, brightness: 1.08, contrast: 0.9, saturation: 0.86, blur: 0.8 }
            : DEFAULT_EFFECTS
    updateSelectedClip((clip) => ({ ...clip, effects }))
    notify('success', t('effectAdded'))
  }

  const applyTransitionPreset = (edge: 'in' | 'out', type: NonNullable<CutClip['transitionIn']>['type'] | null) => {
    if (!selectedClipId) return
    updateSelectedClip((clip) => edge === 'in'
      ? { ...clip, transitionIn: type ? { type, duration: clip.transitionIn?.duration ?? 0.5 } : undefined }
      : { ...clip, transitionOut: type ? { type, duration: clip.transitionOut?.duration ?? 0.5 } : undefined })
    notify('success', t('transitionUpdated'))
  }

  const clearTransitions = () => {
    if (!selectedClipId) return
    updateSelectedClip((clip) => ({ ...clip, transitionIn: undefined, transitionOut: undefined }))
    notify('success', t('transitionUpdated'))
  }

  const addMediaAsset = (asset: MediaSummary, timelineTime = playheadRef.current, targetTrackId?: string) => {
    if (!documentDraft) return
    const sourceClip = documentDraft.tracks.flatMap((track) => track.clips).find((clip) => clip.mediaAssetId === asset.id)
    const type: CutClip['type'] = asset.mimeType.startsWith('video/') ? 'video' : asset.mimeType.startsWith('audio/') ? 'audio' : 'image'
    const requestedDuration = Math.min(asset.duration ?? (type === 'image' ? 5 : 10), MAX_CUT_PROJECT_DURATION)
    const requestedStart = Math.max(0, timelineTime)
    const expandedDuration = type === 'image'
      ? documentDraft.settings.durationSeconds
      : Math.min(MAX_CUT_PROJECT_DURATION, Math.max(documentDraft.settings.durationSeconds, requestedStart + requestedDuration))
    const clipDuration = Math.min(requestedDuration, expandedDuration)
    const id = makeId()
    const clip: CutClip = sourceClip ? {
      ...structuredClone(sourceClip), id, name: asset.originalName,
      start: boundedStart(timelineTime, sourceClip.duration, expandedDuration)
    } : {
      id, type, name: asset.originalName, mediaAssetId: asset.id, previewUrl: asset.previewUrl ?? undefined,
      start: boundedStart(timelineTime, clipDuration, expandedDuration), duration: clipDuration,
      trimIn: 0, trimOut: clipDuration, volume: 1, playbackRate: 1,
      ...(type !== 'audio' ? { transform: { x: 0, y: 0, width: documentDraft.settings.width, height: documentDraft.settings.height, rotation: 0, opacity: 1 } } : {})
    }
    commitDraft((document) => appendClip(
      expandedDuration > document.settings.durationSeconds
        ? { ...document, settings: { ...document.settings, durationSeconds: roundTime(expandedDuration) } }
        : document,
      clip,
      type === 'audio' ? 'audio' : 'visual',
      targetTrackId
    ))
    selectOnly(id)
  }

  const addTrack = (kind: CutTrack['kind']) => {
    commitDraft((document) => ({ ...document, tracks: [...document.tracks, {
      id: makeId(), name: `${kind === 'audio' ? 'Audio' : 'Video'} ${document.tracks.filter((track) => track.kind === kind).length + 1}`,
      kind, muted: false, hidden: false, clips: []
    }] }))
    notify('success', t('trackAdded'))
  }

  const filteredMedia = (data.detail?.media ?? []).filter((asset) => asset.originalName.toLowerCase().includes(mediaSearch.trim().toLowerCase()))
  const renderJobs = data.analysisJobs.filter((job) => job.type === 'render')
  const analysisJobs = data.analysisJobs.filter((job) => job.type !== 'render')
  const activeBackgroundCount = data.analysisJobs.filter((job) => job.status === 'queued' || job.status === 'running').length
  const recentExports = data.detail?.exports.slice(0, 8) ?? []

  return <div className="cut-app">
    <header className="cut-header">
      <div className="cut-brand"><span className="cut-mark"><Film /></span><strong>OpenCut</strong><Badge variant="secondary">Xpert</Badge></div>
      <div className="cut-project-picker">
        <select value={selectedProjectId ?? ''} onChange={(event) => void load(event.target.value || null, true)} aria-label="Cut project">
          <option value="">{t('selectProject')}</option>
          {data.projects.items.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select><ChevronDown />
      </div>
      <div className="cut-history-actions">
        <Button variant="ghost" size="icon-sm" title={t('undo')} disabled={!undoStack.length} onClick={undo}><Undo2 /></Button>
        <Button variant="ghost" size="icon-sm" title={t('redo')} disabled={!redoStack.length} onClick={redo}><Redo2 /></Button>
      </div>
      <div className="cut-status-inline">
        <span>{loading ? t('loading') : status}</span>
        {data.detail && <Badge variant="outline">r{data.detail.item.revision}</Badge>}
        {dirty && <Badge data-status="warning">{t('unsaved')}</Badge>}
      </div>
      <div className="cut-actions">
        <Button variant="ghost" size="sm" onClick={() => void createProject()} disabled={saving}><Plus />{t('newProject')}</Button>
        <Button variant="outline" size="sm" onClick={() => void load(selectedProjectId, true)} disabled={loading}><RotateCcw />{t('reload')}</Button>
        <Button variant="outline" size="sm" onClick={() => void save()} disabled={!dirty || saving}><Save />{t('save')}</Button>
        <Button variant="outline" size="sm" onClick={() => void finalize()} disabled={!data.detail || dirty || saving}><Check />{t('version')}</Button>
        <Button size="sm" onClick={openExportConfiguration} disabled={!data.detail || dirty || saving}><Download />{t('exportProject')}</Button>
      </div>
    </header>

    {remotePending && <div className="cut-conflict"><span>{t('remoteConflict')}</span><Button variant="outline" size="xs" onClick={() => void load(selectedProjectId, true)}>{t('discardReload')}</Button></div>}

    <div className="cut-workspace"><ResizablePanelGroup orientation="vertical">
    <ResizablePanel defaultSize="70%" minSize="30%" maxSize="85%" className="cut-resizable-pane">
    <ResizablePanelGroup orientation="horizontal" className="cut-editor-grid">
      <ResizablePanel defaultSize="20%" minSize="15%" maxSize="40%" className="cut-resizable-pane">
      <aside className="cut-library-panel">
        <Tabs value={libraryTab} onValueChange={setLibraryTab} className="cut-library-tabs">
          <TabsList variant="line" className="cut-library-tablist">
            <TabsTrigger value="media" title={t('media')}><Image /></TabsTrigger>
            <TabsTrigger value="sounds" title={t('sounds')}><Music2 /></TabsTrigger>
            <TabsTrigger value="text" title={t('text')}><Type /></TabsTrigger>
            <TabsTrigger value="stickers" title={t('stickers')}><Sticker /></TabsTrigger>
            <TabsTrigger value="effects" title={t('effects')}><WandSparkles /></TabsTrigger>
            <TabsTrigger value="transitions" title={t('transitions')}><Waves /></TabsTrigger>
            <TabsTrigger value="captions" title={t('captions')}><Captions /></TabsTrigger>
            <TabsTrigger
              value="tasks"
              title={t('tasks')}
              aria-label={`${t('tasks')}${activeBackgroundCount > 0 ? ` (${activeBackgroundCount})` : ''}`}
              className="task-tab-trigger"
            >
              <ListChecks />
              {activeBackgroundCount > 0 && <span aria-hidden="true">{activeBackgroundCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="adjustment" title={t('adjustment')}><SlidersHorizontal /></TabsTrigger>
            <TabsTrigger value="settings" title={t('settings')}><Settings2 /></TabsTrigger>
          </TabsList>
          <div className="cut-library-content">
            <div className="panel-heading"><strong>{t('library')}</strong><Button variant="ghost" size="icon-xs" onClick={() => uploadRef.current?.click()} disabled={!data.detail}><Upload /></Button></div>
            <input ref={uploadRef} className="hidden-input" type="file" accept="video/*,audio/*,image/*" onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.currentTarget.value = ''
            }} />
            <TabsContent value="media" className="cut-library-pane">
              <Input className="cut-search" value={mediaSearch} placeholder={t('searchMedia')} onChange={(event) => setMediaSearch(event.target.value)} />
              <Button variant="outline" size="sm" className="cut-upload-button" onClick={() => uploadRef.current?.click()} disabled={!data.detail}><Upload />{t('upload')}</Button>
              <div className="media-analysis-card" data-media-analysis-state={mediaAnalysisProgress ? 'running' : 'idle'}>
                <div className="caption-section-title"><Sparkles />{t('mediaIntelligence')}</div>
                <select className="compact-select" aria-label={t('mediaAnalysisSource')} value={mediaAnalysisAssetId} onChange={(event) => setMediaAnalysisAssetId(event.target.value)} disabled={Boolean(mediaAnalysisProgress)}>
                  {!localTranscriptionMedia.length && <option value="">{t('localNoMedia')}</option>}
                  {localTranscriptionMedia.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
                </select>
                {mediaAnalysisProgress ? <div className="local-transcription-progress"><Progress value={mediaAnalysisProgress.progress} /><span>{mediaAnalysisProgress.message}</span><Button variant="outline" size="sm" onClick={() => mediaAnalysisCancelRef.current?.()}>{t('cancelJob')}</Button></div>
                  : <Button size="sm" variant="outline" disabled={!mediaAnalysisAssetId || dirty || saving} onClick={() => void runLocalMediaAnalysis()}><Sparkles />{t('mediaAnalyze')}</Button>}
                <small>{t('mediaAnalysisNote')}</small>
                {!!data.mediaSegments.length && <div className="media-evidence-list">{data.mediaSegments.filter((segment) => !mediaAnalysisAssetId || segment.mediaAssetId === mediaAnalysisAssetId).slice(0, 8).map((segment) => <div key={segment.id} title={segment.text ?? segment.label}>
                  <Badge variant="outline">{segment.evidenceType}</Badge><span>{formatTime(segment.start)}–{formatTime(segment.end)}</span><small>{segment.text ?? segment.label}</small>
                </div>)}</div>}
              </div>
              <ScrollArea className="cut-library-scroll">
                {!filteredMedia.length && <div className="empty-card">{t('emptyMedia')}</div>}
                <div className="media-grid">{filteredMedia.map((asset, index) => <MediaCard key={asset.id ?? `${asset.originalName}-${index}`} asset={asset} onAdd={() => addMediaAsset(asset)} />)}</div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="text" className="cut-library-pane"><div className="preset-list">
              <Button variant="outline" className="text-preset heading" onClick={() => addTextClip('heading')}>{t('addHeading')}</Button>
              <Button variant="outline" className="text-preset subtitle" onClick={() => addTextClip('subtitle')}>{t('addSubtitle')}</Button>
              <Button variant="outline" className="text-preset body" onClick={() => addTextClip('bodyText')}>{t('addBody')}</Button>
            </div></TabsContent>
            <TabsContent value="sounds" className="cut-library-pane"><ScrollArea className="cut-library-scroll"><div className="media-grid">
              {filteredMedia.filter((asset) => asset.mimeType.startsWith('audio/')).map((asset, index) => <MediaCard key={asset.id ?? `${asset.originalName}-${index}`} asset={asset} onAdd={() => addMediaAsset(asset)} />)}
            </div></ScrollArea></TabsContent>
            <TabsContent value="stickers" className="cut-library-pane"><div className="sticker-grid">
              {STICKER_PRESETS.map((sticker) => <button key={sticker} onClick={() => addSticker(sticker)}>{sticker}</button>)}
            </div></TabsContent>
            <TabsContent value="effects" className="cut-library-pane"><div className="effect-grid">
              {(['none', 'mono', 'warm', 'punch', 'dream'] as const).map((preset) => <Button key={preset} variant="outline" disabled={!selectedClip || selectedClip.type === 'audio'} onClick={() => applyEffectPreset(preset)}><Sparkles />{t(preset === 'none' ? 'effectNone' : preset === 'mono' ? 'effectMono' : preset === 'warm' ? 'effectWarm' : preset === 'punch' ? 'effectPunch' : 'effectDream')}</Button>)}
            </div></TabsContent>
            <TabsContent value="transitions" className="cut-library-pane"><div className="transition-presets">
              <strong>{t('transitionIn')}</strong>
              <div>{TRANSITION_TYPES.map((type) => <Button key={`in-${type}`} variant={selectedClip?.transitionIn?.type === type ? 'secondary' : 'outline'} disabled={!selectedClip || selectedClip.type === 'audio'} onClick={() => applyTransitionPreset('in', type)}><Waves />{t(type)}</Button>)}</div>
              <strong>{t('transitionOut')}</strong>
              <div>{TRANSITION_TYPES.map((type) => <Button key={`out-${type}`} variant={selectedClip?.transitionOut?.type === type ? 'secondary' : 'outline'} disabled={!selectedClip || selectedClip.type === 'audio'} onClick={() => applyTransitionPreset('out', type)}><Waves />{t(type)}</Button>)}</div>
              <Button variant="ghost" size="sm" disabled={!selectedClip} onClick={clearTransitions}>{t('clearTransitions')}</Button>
            </div></TabsContent>
            <TabsContent value="captions" className="cut-library-pane"><div className="caption-workflow">
              <input ref={subtitleUploadRef} className="hidden-input" type="file" accept=".srt,.vtt,.ass,text/vtt,application/x-subrip,text/x-ssa" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importSubtitles(file)
                event.currentTarget.value = ''
              }} />
              <div className="caption-section-title"><Sparkles />{t('editProposals')}</div>
              {!data.editProposals.length && <div className="empty-card">{t('noEditProposals')}</div>}
              <div className="proposal-list">{data.editProposals.map((proposal) => <button key={proposal.id} data-proposal-status={proposal.status} className={proposalReview?.item.id === proposal.id ? 'active' : ''} onClick={() => proposal.id && void loadEditProposal(proposal.id)}>
                <span>{proposal.goal}</span><small>r{proposal.revision} · {proposal.enabledItemCount}/{proposal.itemCount} · {proposal.status}</small>
              </button>)}</div>
              {proposalReview && <div className="proposal-review" data-testid="cut-proposal-review">
                <div className="proposal-review-head"><strong>{proposalReview.item.goal}</strong><div><Badge variant="outline">r{proposalReview.item.sourceRevision}</Badge>{proposalReview.item.highRiskCount > 0 && <Badge data-status="warning">{proposalReview.item.highRiskCount} {t('highRisk')}</Badge>}</div></div>
                <div className="proposal-diff"><span>{proposalReview.preview.changedClipIds.length} {t('clipsChanged')}</span><span>{proposalReview.preview.changedTrackIds.length} {t('tracksChanged')}</span><span>{formatTime(proposalReview.preview.estimatedDurationSeconds)}</span></div>
                {proposalReview.preview.document && <div className="proposal-preview" aria-label={t('proposalPreview')}><StageCanvas document={proposalReview.preview.document} playhead={Math.min(playhead, proposalReview.preview.document.settings.durationSeconds)} playing={false} zoom={1} selectedClipIds={[]} onSelect={() => undefined} onTransform={() => undefined} onState={() => undefined} emptyText={t('selectOrUpload')} /></div>}
                <div className="proposal-item-list">{proposalReview.item.items.map((item) => <label key={item.id} data-risk={item.risk}>
                  <input type="checkbox" checked={item.enabled} disabled={proposalReview.item.status !== 'draft' || saving} onChange={(event) => void setProposalItemEnabled(item.id, event.target.checked)} />
                  <span><strong>{item.summary}</strong><small>{item.operation.kind} · {Math.round(item.confidence * 100)}% · {item.risk}</small>{item.evidence.slice(0, 3).map((evidence) => <em key={evidence.segmentId} title={evidence.text ?? evidence.label}>{evidence.evidenceType} {formatTime(evidence.start)}–{formatTime(evidence.end)}</em>)}</span>
                </label>)}</div>
                <div className="proposal-actions">{proposalReview.item.status === 'applied' ? <Button variant="outline" size="sm" data-testid="cut-revert-proposal" disabled={proposalReview.item.appliedRevision !== data.detail?.item.revision || dirty || saving} onClick={() => void revertEditProposal()}><RotateCcw />{t('revertProposal')}</Button> : <span className="proposal-draft-actions"><Button variant="outline" size="sm" disabled={proposalReview.item.status !== 'draft' || saving} onClick={() => void rejectEditProposal()}>{t('rejectProposal')}</Button><Button size="sm" data-testid="cut-apply-proposal" disabled={proposalReview.item.status !== 'draft' || proposalReview.preview.enabledItemCount < 1 || proposalReview.item.sourceRevision !== data.detail?.item.revision || dirty || saving} onClick={() => void applyEditProposal()}><Check />{t('applyProposal')}</Button></span>}</div>
                {proposalReview.item.status === 'draft' && proposalReview.item.sourceRevision !== data.detail?.item.revision && <small className="proposal-stale">{t('proposalStale')}</small>}
              </div>}
              <div className="local-transcription-card" data-local-transcription-state={localTranscriptionProgress ? 'running' : 'idle'}>
                <div className="caption-section-title"><WandSparkles />{t('localTranscription')}</div>
                <select className="compact-select" aria-label={t('localMedia')} value={localTranscriptionAssetId} onChange={(event) => setLocalTranscriptionAssetId(event.target.value)} disabled={Boolean(localTranscriptionProgress)}>
                  {!localTranscriptionMedia.length && <option value="">{t('localNoMedia')}</option>}
                  {localTranscriptionMedia.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
                </select>
                <select className="compact-select" aria-label={t('localModel')} value={localTranscriptionModel} onChange={(event) => setLocalTranscriptionModel(event.target.value)} disabled={Boolean(localTranscriptionProgress)}>
                  {CUT_LOCAL_TRANSCRIPTION_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
                <select className="compact-select" aria-label={t('localLanguage')} value={localTranscriptionLanguage} onChange={(event) => setLocalTranscriptionLanguage(event.target.value)} disabled={Boolean(localTranscriptionProgress)}>
                  {CUT_LOCAL_TRANSCRIPTION_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
                </select>
                <small>{t('localPrivacyNote')}</small>
                {localTranscriptionProgress ? <div className="local-transcription-progress">
                  <Progress value={localTranscriptionProgress.progress} />
                  <span>{localTranscriptionProgress.message}</span>
                  {localTranscriptionProgress.file && <small title={localTranscriptionProgress.file}>{localTranscriptionProgress.file}</small>}
                  <Button variant="outline" size="sm" onClick={cancelLocalTranscription}>{t('localCancel')}</Button>
                </div> : <Button size="sm" disabled={!localTranscriptionAssetId || dirty || saving} onClick={() => void runLocalTranscription()}><WandSparkles />{t('localStart')}</Button>}
              </div>
              <Button variant="outline" size="sm" onClick={() => subtitleUploadRef.current?.click()} disabled={!data.detail || saving}><Upload />{t('importSubtitles')}</Button>
              <div className="caption-section-title">{t('captionDrafts')}</div>
              {!data.captionDrafts.length && <div className="empty-card">{t('noCaptionDrafts')}</div>}
              <div className="caption-draft-list">{data.captionDrafts.map((draft) => <button key={draft.id} className={captionReview?.item.id === draft.id ? 'active' : ''} onClick={() => draft.id && void loadCaptionDraft(draft.id)}>
                <span>{draft.language.toUpperCase()} · {draft.captionCount}</span><small>r{draft.revision} · {draft.status}</small>
              </button>)}</div>
              {captionReview && <div className="caption-review">
                <div className="caption-review-toolbar"><Badge variant="outline">{captionReview.total} · r{captionReview.item.revision}</Badge><div>
                  <Button variant="ghost" size="xs" disabled={captionReview.item.status !== 'draft'} onClick={() => void runCaptionEdit({ action: 'offset', seconds: -0.1 })}>{t('offsetEarlier')}</Button>
                  <Button variant="ghost" size="xs" disabled={captionReview.item.status !== 'draft'} onClick={() => void runCaptionEdit({ action: 'offset', seconds: 0.1 })}>{t('offsetLater')}</Button>
                </div></div>
                <ScrollArea className="caption-cue-scroll"><div className="caption-cue-list">{captionReview.captions.map((caption, index) => {
                  const next = captionReview.captions[index + 1]
                  const split = splitCaptionText(caption.text)
                  return <div className="caption-cue" key={caption.id}>
                    <div className="caption-cue-time"><input type="number" min="0" step="0.01" value={caption.start} onChange={(event) => updateCaptionCueLocal(caption.id, { start: Number(event.target.value) })} /><span>→</span><input type="number" min="0.01" step="0.01" value={caption.end} onChange={(event) => updateCaptionCueLocal(caption.id, { end: Number(event.target.value) })} /></div>
                    <textarea value={caption.text} onChange={(event) => updateCaptionCueLocal(caption.id, { text: event.target.value })} />
                    <div className="caption-cue-actions">
                      <Button variant="ghost" size="icon-xs" title={t('save')} disabled={captionReview.item.status !== 'draft'} onClick={() => void runCaptionEdit({ action: 'update', captionId: caption.id, start: caption.start, end: caption.end, text: caption.text })}><Save /></Button>
                      <Button variant="ghost" size="icon-xs" title={t('split')} disabled={captionReview.item.status !== 'draft' || !split} onClick={() => split && void runCaptionEdit({ action: 'split', captionId: caption.id, at: (caption.start + caption.end) / 2, leftText: split[0], rightText: split[1] })}><Scissors /></Button>
                      <Button variant="ghost" size="xs" title={t('mergeNext')} disabled={captionReview.item.status !== 'draft' || !next} onClick={() => next && void runCaptionEdit({ action: 'merge', captionIds: [caption.id, next.id] })}>{t('mergeNext')}</Button>
                      <Button variant="ghost" size="icon-xs" title={t('delete')} disabled={captionReview.item.status !== 'draft' || captionReview.total <= 1} onClick={() => void runCaptionEdit({ action: 'delete', captionIds: [caption.id] })}><Trash2 /></Button>
                    </div>
                  </div>
                })}</div></ScrollArea>
                {captionReview.total > captionReview.pageSize && <div className="caption-pagination"><Button variant="ghost" size="xs" disabled={captionReview.page <= 1} onClick={() => captionReview.item.id && void loadCaptionDraft(captionReview.item.id, captionReview.page - 1)}>‹</Button><span>{captionReview.page} / {Math.ceil(captionReview.total / captionReview.pageSize)}</span><Button variant="ghost" size="xs" disabled={captionReview.page * captionReview.pageSize >= captionReview.total} onClick={() => captionReview.item.id && void loadCaptionDraft(captionReview.item.id, captionReview.page + 1)}>›</Button></div>}
                <Button size="sm" disabled={captionReview.item.status !== 'draft' || saving} onClick={() => void commitCaptionReview()}><Check />{t('commitDraft')}</Button>
              </div>}
              <div className="caption-section-title">{t('addCaption')}</div>
              <div className="caption-form">
                <Input value={captionText} placeholder={t('captionPlaceholder')} onChange={(event) => setCaptionText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addCaption() }} />
                <Button size="sm" disabled={!captionText.trim() || !documentDraft} onClick={addCaption}><Captions />{t('addCaption')}</Button>
              </div>
            </div></TabsContent>
            <TabsContent value="tasks" className="cut-library-pane task-center-pane">
              <div className="task-center-heading"><div><strong>{t('tasks')}</strong><small>{t('taskCenterDescription')}</small></div><Button variant="ghost" size="icon-sm" title={t('reload')} disabled={loading} onClick={() => void load(selectedProjectId, true)}><RotateCcw /></Button></div>
              <ScrollArea className="task-center-scroll"><div className="export-center-list">
                <div className="export-center-section-title">{t('exportCenter')}</div>
                <div className={`render-capability ${headlessReady ? 'available' : 'unavailable'}`}>
                  <div><strong>{t('headlessRuntime')}</strong><Badge variant="outline">{headlessReady ? t('headlessReady') : t('headlessUnavailable')}</Badge></div>
                  <small>{headlessMediaMessage ?? (data.renderCapability.available ? `${data.renderCapability.runtimeProfile ?? 'browser runtime'} · ${data.renderCapability.workerCount ?? 0} worker` : data.renderCapability.message ?? data.renderCapability.reason)}</small>
                </div>
                {!renderJobs.length && <div className="empty-card">{t('noExports')}</div>}
                {renderJobs.map((job) => <div className={`export-task-card ${job.status}`} key={job.id}>
                  <div className="export-task-row"><strong>{(job.exportSettings?.format ?? 'mp4').toUpperCase()} · {job.variantName ?? 'default'}</strong><Badge variant={job.status === 'failed' ? 'destructive' : 'outline'} data-status={job.status === 'succeeded' ? 'success' : job.status === 'running' || job.status === 'queued' ? 'warning' : undefined}>{job.status}</Badge></div>
                  <small>{formatExportQuality(job.exportSettings?.quality ?? 'high', t)} · {job.exportSettings?.includeAudio === false ? t('audioExcluded') : t('audioIncluded')} · r{job.inputRevision}</small>
                  {(job.status === 'queued' || job.status === 'running') && <Progress value={job.progress} />}
                  <div className="export-task-row"><small>{job.stage ?? job.status} · {job.progress}%</small><span>
                    {job.resultExportId && <Button variant="outline" size="xs" disabled={downloadingExportId === job.resultExportId} onClick={() => void downloadExport(job.resultExportId!)}><Download />{t('download')}</Button>}
                    {job.id && (job.status === 'queued' || job.status === 'running') && <Button variant="ghost" size="xs" disabled={saving || job.cancellationRequested} onClick={() => void cancelAnalysisJob(job.id!)}>{t('cancelJob')}</Button>}
                  </span></div>
                  {job.errorMessage && <p className="export-task-error" title={job.errorMessage}>{formatBackgroundJobError(job.errorMessage, t)}</p>}
                  {isWorkspaceMediaMissing(job.errorMessage) && <Button variant="outline" size="xs" onClick={() => { setLibraryTab('media'); uploadRef.current?.click() }}><Upload />{t('repairMedia')}</Button>}
                </div>)}
                {!!analysisJobs.length && <div className="export-center-section-title">{t('analysisJobs')}</div>}
                {analysisJobs.map((job) => <div key={job.id} className={`analysis-job ${job.status}`}>
                  <div><strong>{job.type === 'transcription' ? `STT · ${(job.language ?? 'und').toUpperCase()}` : `${job.type.replaceAll('_', ' ')} · ${job.executionMode.toUpperCase()}`}</strong><small>{job.stage ?? job.status} · {job.progress}%</small></div>
                  {job.errorMessage && <span title={job.errorMessage}>{formatBackgroundJobError(job.errorMessage, t)}</span>}
                  {job.id && (job.status === 'queued' || job.status === 'running') && <Button variant="ghost" size="xs" disabled={saving || job.cancellationRequested} onClick={() => void cancelAnalysisJob(job.id!)}>{t('cancelJob')}</Button>}
                </div>)}
                {!!recentExports.length && <div className="export-center-section-title">{t('recentOutputs')}</div>}
                {recentExports.map((item) => <div className="export-output-row" key={item.id}>
                  <div><strong>{item.fileName || `${item.kind.toUpperCase()} export`}</strong><small>{item.kind.toUpperCase()} · {formatBytes(item.size)}{item.sourceRevision ? ` · r${item.sourceRevision}` : ''}</small></div>
                  {item.id && <Button variant="ghost" size="icon-sm" title={t('download')} disabled={downloadingExportId === item.id} onClick={() => void downloadExport(item.id!)}><Download /></Button>}
                </div>)}
              </div></ScrollArea>
            </TabsContent>
            <TabsContent value="adjustment" className="cut-library-pane">{selectedClip && selectedClip.type !== 'audio' ? <div className="adjustment-grid">
              <label>{t('effectPunch')}<Slider min={0} max={2} step={0.05} value={[selectedClip.effects?.contrast ?? 1]} onValueChange={(value) => updateSelectedClip((clip) => ({ ...clip, effects: { ...(clip.effects ?? DEFAULT_EFFECTS), contrast: value[0] ?? 1 } }))} /></label>
              <label>{t('effectWarm')}<Slider min={0} max={2} step={0.05} value={[selectedClip.effects?.saturation ?? 1]} onValueChange={(value) => updateSelectedClip((clip) => ({ ...clip, effects: { ...(clip.effects ?? DEFAULT_EFFECTS), saturation: value[0] ?? 1 } }))} /></label>
            </div> : <div className="empty-card">{t('noSelection')}</div>}</TabsContent>
            <TabsContent value="settings" className="cut-library-pane"><ScrollArea className="cut-library-scroll"><div className="settings-stack">
              <strong>{t('background')}</strong><div className="color-grid">{COLOR_PRESETS.map((color) => <button key={color} className="color-swatch" style={{ background: color }} onClick={() => documentDraft && commitDraft((document) => ({ ...document, settings: { ...document.settings, background: color } }))} title={`${t('background')} ${color}`} />)}</div>
              <Button variant="outline" size="sm" onClick={() => addColorClip(documentDraft?.settings.background ?? '#111827')} disabled={!documentDraft}><Layers3 />{t('addColor')}</Button>
            </div></ScrollArea></TabsContent>
          </div>
        </Tabs>
      </aside>
      </ResizablePanel>
      <ResizableHandle withHandle />

      <ResizablePanel defaultSize="58%" minSize="30%" className="cut-resizable-pane">
      <section className="cut-canvas-panel">
        <div className="canvas-toolbar"><Badge variant="outline">{documentDraft ? `${documentDraft.settings.width} × ${documentDraft.settings.height}` : t('canvas')}</Badge><span>{t('keyboardHint')}</span></div>
        <div ref={stageShellRef} className="stage-shell">
          <StageCanvas document={documentDraft} playhead={playhead} playing={isPlaying} zoom={previewZoom === 'fit' ? 1 : Number(previewZoom) / 100} selectedClipIds={selectedClipIds} onSelect={selectOnly} onTransform={(clipId, transform) => commitDraft((document) => updateClip(document, clipId, (clip) => ({ ...clip, transform })))} onState={handleMediaState} emptyText={t('selectOrUpload')} />
          <span className={`media-state ${mediaState}`}>{mediaState === 'loaded' ? t('mediaLoaded') : mediaState}</span>
        </div>
        <div className="playback-controls">
          <code>{formatTime(playhead)} <span>/</span> {formatTime(duration)}</code>
          <div className="playback-center"><Button variant="ghost" size="icon-sm" title={t('previousFrame')} onClick={() => seek(playhead - 1 / (documentDraft?.settings.fps ?? 30))}><SkipBack /></Button>
            <Button variant="ghost" size="icon" className="play-button" title={isPlaying ? t('pause') : t('play')} onClick={togglePlayback}>{isPlaying ? <Pause /> : <Play />}</Button>
            <Button variant="ghost" size="icon-sm" title={t('nextFrame')} onClick={() => seek(playhead + 1 / (documentDraft?.settings.fps ?? 30))}><SkipForward /></Button></div>
          <div className="preview-actions"><select aria-label={t('previewZoom')} value={previewZoom} onChange={(event) => setPreviewZoom(event.target.value)}><option value="fit">{t('fit')}</option>{[25, 50, 75, 100, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}</select>
            <Button variant="ghost" size="icon-sm" title={t('fullscreen')} onClick={() => void stageShellRef.current?.requestFullscreen()}><Maximize2 /></Button></div>
        </div>
      </section>
      </ResizablePanel>
      <ResizableHandle withHandle />

      <ResizablePanel defaultSize="22%" minSize="15%" maxSize="40%" className="cut-resizable-pane">
      <aside className="cut-inspector-panel">
        <div className="panel-heading"><strong>{t('properties')}</strong>{selectedClipIds.length > 1 ? <Badge variant="secondary">{selectedClipIds.length} {t('selected')}</Badge> : <Settings2 />}</div>
        <Tabs defaultValue="basic" className="cut-inspector-tabs">
          <TabsList className="cut-inspector-tablist"><TabsTrigger value="basic">{t('basic')}</TabsTrigger><TabsTrigger value="project">{t('project')}</TabsTrigger></TabsList>
          <TabsContent value="basic" className="cut-inspector-pane"><ScrollArea className="cut-inspector-scroll">
            {!selectedClip && <div className="empty-card">{t('noSelection')}</div>}
            {selectedClip && <ClipInspector clip={selectedClip} document={documentDraft!} t={t} onChange={updateSelectedClip} onDuplicate={duplicateSelected} onDelete={deleteSelected} onRestoreSourceDuration={() => void matchSelectedSourceDuration()} restoringDuration={restoringDuration} />}
          </ScrollArea></TabsContent>
          <TabsContent value="project" className="cut-inspector-pane"><ScrollArea className="cut-inspector-scroll">
            {documentDraft && <ProjectInspector document={documentDraft} t={t} onChange={(settings) => commitDraft((document) => ({ ...document, settings: { ...document.settings, ...settings } }))} />}
          </ScrollArea></TabsContent>
        </Tabs>
      </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
    </ResizablePanel>
    <ResizableHandle withHandle />

    <ResizablePanel defaultSize="30%" minSize="15%" maxSize="70%" className="cut-resizable-pane">
    <section className="cut-timeline-panel">
      <div className="timeline-toolbar">
        <div className="timeline-title"><strong>{t('timeline')}</strong><Badge variant="outline">{documentDraft?.tracks.length ?? 0} {t('layers')}</Badge>{selectedClipIds.length > 1 && <Badge variant="secondary">{selectedClipIds.length} {t('selected')}</Badge>}</div>
        <div className="timeline-edit-actions">
          <Button variant="ghost" size="icon-xs" title={t('split')} disabled={!selectedClip} onClick={splitSelected}><Scissors /></Button>
          <Button variant="ghost" size="icon-xs" title={t('splitLeft')} disabled={!selectedClip} onClick={() => trimSelectedAtPlayhead('left')}><PanelLeftClose /></Button>
          <Button variant="ghost" size="icon-xs" title={t('splitRight')} disabled={!selectedClip} onClick={() => trimSelectedAtPlayhead('right')}><PanelRightClose /></Button>
          <Button variant="ghost" size="icon-xs" title={t('copy')} disabled={!selectedClipIds.length} onClick={copySelection}><ClipboardCopy /></Button>
          <Button variant="ghost" size="icon-xs" title={t('paste')} disabled={!documentDraft || !hasClipboard} onClick={pasteSelection}><ClipboardPaste /></Button>
          <Button variant="ghost" size="icon-xs" title={t('duplicate')} disabled={!selectedClip} onClick={duplicateSelected}><CopyPlus /></Button>
          <Button variant="ghost" size="icon-xs" title={t('extractAudio')} disabled={selectedClip?.type !== 'video' || selectedClip.audioDetached} onClick={extractSelectedAudio}><Unlink /></Button>
          <Button variant={bookmarkAtPlayhead ? 'secondary' : 'ghost'} size="icon-xs" title={bookmarkAtPlayhead ? t('removeBookmark') : t('addBookmark')} disabled={!documentDraft} onClick={toggleBookmark}><Bookmark /></Button>
          <Button variant="ghost" size="icon-xs" title={t('delete')} disabled={!selectedClip} onClick={deleteSelected}><Trash2 /></Button>
        </div>
        <div className="timeline-track-actions">
          <Button variant="ghost" size="xs" onClick={() => addTrack('visual')}><Plus />{t('addVideoTrack')}</Button>
          <Button variant="ghost" size="xs" onClick={() => addTrack('audio')}><Plus />{t('addAudioTrack')}</Button>
        </div>
        <div className="timeline-mode-actions"><Button variant={snappingEnabled ? 'secondary' : 'ghost'} size="icon-xs" title={t('snapping')} aria-pressed={snappingEnabled} onClick={() => setSnappingEnabled((value) => !value)}><Magnet /></Button><Button variant={rippleEditingEnabled ? 'secondary' : 'ghost'} size="icon-xs" title={t('ripple')} aria-pressed={rippleEditingEnabled} onClick={() => setRippleEditingEnabled((value) => !value)}><Waves /></Button></div>
        <div className="timeline-zoom"><ZoomOut /><Slider min={24} max={120} step={4} value={[pixelsPerSecond]} onValueChange={(value) => setPixelsPerSecond(value[0] ?? 48)} /><ZoomIn /></div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-content" style={{ width: duration * pixelsPerSecond + TRACK_GUTTER }}>
          <div className="timeline-ruler-row"><div className="ruler-gutter" /><div className="timeline-ruler" onPointerDown={(event) => seek((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixelsPerSecond)}>
            {rulerMarks(duration).map((second) => <span key={second} style={{ left: second * pixelsPerSecond }}>{second}s</span>)}
            {(documentDraft?.bookmarks ?? []).map((bookmark) => <button key={bookmark.id} className="timeline-bookmark" style={{ left: bookmark.time * pixelsPerSecond }} title={bookmark.label} onPointerDown={(event) => { event.stopPropagation(); seek(bookmark.time) }}><Bookmark /></button>)}
            <i className="global-playhead" style={{ left: playhead * pixelsPerSecond }} />
          </div></div>
          {documentDraft?.tracks.map((track) => <div className="timeline-row" key={track.id}>
            <div className="track-label"><div><strong>{track.name}</strong><small>{track.kind}</small></div><div className="track-controls">
              <Button variant="ghost" size="icon-xs" title={t('trackVisible')} onClick={() => commitDraft((document) => updateTrack(document, track.id, (item) => ({ ...item, hidden: !item.hidden })))}>{track.hidden ? <EyeOff /> : <Eye />}</Button>
              <Button variant="ghost" size="icon-xs" title={t('trackMuted')} onClick={() => commitDraft((document) => updateTrack(document, track.id, (item) => ({ ...item, muted: !item.muted })))}>{track.muted ? <VolumeX /> : <Volume2 />}</Button>
            </div></div>
            <div className={`track-lane ${dropTrackId === track.id ? 'drop-target' : ''}`} data-track-id={track.id} onPointerDown={(event) => { if (event.target === event.currentTarget) seek((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixelsPerSecond) }} onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(CUT_MEDIA_DRAG_TYPE)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDropTrackId(track.id)
            }} onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTrackId(null)
            }} onDrop={(event) => {
              event.preventDefault()
              const key = event.dataTransfer.getData(CUT_MEDIA_DRAG_TYPE)
              const asset = data.detail?.media.find((item) => mediaDragKey(item) === key)
              setDropTrackId(null)
              if (!asset) return
              const rect = event.currentTarget.getBoundingClientRect()
              addMediaAsset(asset, (event.clientX - rect.left) / pixelsPerSecond, track.id)
            }}>
              {track.clips.map((clip) => <div role="button" tabIndex={0} key={clip.id} className={`timeline-clip ${clip.type} ${selectedClipIds.includes(clip.id) ? 'selected' : ''}`} style={{ left: clip.start * pixelsPerSecond, width: Math.max(24, clip.duration * pixelsPerSecond) }} onPointerDown={(event) => {
                selectClip(clip.id, event.shiftKey)
                if (event.shiftKey) return
                if (!documentDraft) return
                dragRef.current = {
                  mode: 'move', clipId: clip.id, startX: event.clientX, initialStart: clip.start, initialDuration: clip.duration,
                  initialTrimIn: clip.trimIn, initialTrimOut: clip.trimOut, projectDuration: duration, pixelsPerSecond,
                  snapping: snappingEnabled, ripple: rippleEditingEnabled, snapPoints: collectSnapPoints(documentDraft, clip.id, playheadRef.current),
                  original: structuredClone(documentDraft), changed: false
                }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}>
                <span className="trim-handle left" onPointerDown={(event) => beginTrim(event, 'trim-start', clip, documentDraft, duration, pixelsPerSecond, snappingEnabled, rippleEditingEnabled, playheadRef.current, dragRef, selectOnly)} />
                {clip.type === 'audio' && <AudioWaveform clip={clip} />}
                <ClipGlyph type={clip.type} /><div className="clip-copy"><strong>{clip.name}</strong><small>{clip.start.toFixed(2)}–{(clip.start + clip.duration).toFixed(2)}s</small></div>
                <span className="trim-handle right" onPointerDown={(event) => beginTrim(event, 'trim-end', clip, documentDraft, duration, pixelsPerSecond, snappingEnabled, rippleEditingEnabled, playheadRef.current, dragRef, selectOnly)} />
              </div>)}
              <span className="playhead" style={{ left: playhead * pixelsPerSecond }} />
            </div>
          </div>)}
        </div>
      </div>
    </section>
    </ResizablePanel>
    </ResizablePanelGroup></div>

    <Dialog open={exportDialogOpen} onOpenChange={(open) => { if (!saving) setExportDialogOpen(open) }}>
      <DialogContent className="cut-export-dialog">
        <DialogHeader>
          <DialogTitle>{t('exportProject')}</DialogTitle>
          <DialogDescription>{t('exportDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="export-mode-switch" role="group" aria-label={t('exportMode')}>
          <button type="button" className={exportMode === 'browser' ? 'active' : ''} aria-pressed={exportMode === 'browser'} onClick={() => setExportMode('browser')} disabled={saving}><Download /><span><strong>{t('browserExport')}</strong><small>{t('browserExportDescription')}</small></span></button>
          <button type="button" className={exportMode === 'background' ? 'active' : ''} aria-pressed={exportMode === 'background'} onClick={() => setExportMode('background')} disabled={saving || !headlessReady}><Film /><span><strong>{t('backgroundExport')}</strong><small>{headlessReady ? t('backgroundExportDescription') : headlessMediaMessage ?? data.renderCapability.message ?? t('headlessUnavailable')}</small></span></button>
        </div>
        <section className="export-option-section">
          <div><strong>{t('format')}</strong><small>{t('formatDescription')}</small></div>
          <div className="export-option-grid">
            {(['mp4', 'webm'] as const).map((format) => <button type="button" key={format} className={exportSettings.format === format ? 'active' : ''} aria-pressed={exportSettings.format === format} disabled={saving} onClick={() => setExportSettings((current) => ({ ...current, format }))}>
              <span className="export-radio" />
              <span><strong>{format === 'mp4' ? 'MP4 (H.264)' : 'WebM (VP9)'}</strong><small>{format === 'mp4' ? t('mp4Description') : t('webmDescription')}</small></span>
            </button>)}
          </div>
        </section>
        <section className="export-option-section">
          <div><strong>{t('quality')}</strong><small>{t('qualityDescription')}</small></div>
          <div className="export-quality-grid">
            {(['low', 'medium', 'high', 'very_high'] as const).map((quality) => <button type="button" key={quality} className={exportSettings.quality === quality ? 'active' : ''} aria-pressed={exportSettings.quality === quality} disabled={saving} onClick={() => setExportSettings((current) => ({ ...current, quality }))}>
              <span className="export-radio" /><span><strong>{formatExportQuality(quality, t)}</strong><small>{t(quality === 'low' ? 'qualityLowDescription' : quality === 'medium' ? 'qualityMediumDescription' : quality === 'very_high' ? 'qualityVeryHighDescription' : 'qualityHighDescription')}</small></span>
            </button>)}
          </div>
        </section>
        <section className="export-audio-row">
          <div><strong>{t('audio')}</strong><small>{t('audioExportDescription')}</small></div>
          <Switch checked={exportSettings.includeAudio} disabled={saving} onCheckedChange={(includeAudio) => setExportSettings((current) => ({ ...current, includeAudio }))} />
        </section>
        {documentDraft && <div className="export-summary"><span>{documentDraft.settings.width} × {documentDraft.settings.height}</span><span>{documentDraft.settings.fps} FPS</span><span>{formatTime(documentDraft.settings.durationSeconds)}</span><span>{exportSettings.format.toUpperCase()}</span></div>}
        {exportProgress !== null && <div className="export-dialog-progress"><div><span>{t('rendering')}</span><b>{Math.round(exportProgress * 100)}%</b></div><Progress value={exportProgress * 100} /></div>}
        <DialogFooter>
          {exportProgress !== null
            ? <Button variant="outline" onClick={() => exportCancelRef.current?.()}>{t('cancelExport')}</Button>
            : <Button variant="outline" disabled={saving} onClick={() => setExportDialogOpen(false)}>{t('cancelJob')}</Button>}
          <Button disabled={saving || !data.detail || dirty || (exportMode === 'background' && !headlessReady)} onClick={() => void submitExport()}>{exportMode === 'background' ? <Film /> : <Download />}{exportMode === 'background' ? t('queueExport') : t('startExport')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {exportProgress !== null && <div className="export-progress"><div><span>{t('exportProgress')}</span><b>{Math.round(exportProgress * 100)}%</b></div><Progress value={exportProgress * 100} /></div>}
    <canvas ref={exportCanvasRef} className="export-canvas" aria-hidden="true" />
  </div>
}

function MediaCard({ asset, onAdd }: { asset: MediaSummary; onAdd: () => void }) {
  const visual = asset.mimeType.startsWith('image/') && asset.previewUrl
  return <button className="media-card" draggable onDragStart={(event) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(CUT_MEDIA_DRAG_TYPE, mediaDragKey(asset))
  }} onClick={onAdd} title={asset.originalName}>
    <span className="media-thumb">{visual ? <img src={asset.previewUrl ?? ''} crossOrigin="use-credentials" alt="" /> : asset.mimeType.startsWith('video/') ? <Film /> : asset.mimeType.startsWith('audio/') ? <Music2 /> : <Image />}</span>
    <span><strong>{asset.originalName}</strong><small>{formatBytes(asset.size)}</small></span><Plus />
  </button>
}

function StageCanvas({ document, playhead, playing, zoom, selectedClipIds, onSelect, onTransform, onState, emptyText }: {
  document: CutDocument | null
  playhead: number
  playing: boolean
  zoom: number
  selectedClipIds: string[]
  onSelect: (id: string) => void
  onTransform: (id: string, transform: NonNullable<CutClip['transform']>) => void
  onState: (state: string, mediaAssetId?: string, sourceUrl?: string) => void
  emptyText: string
}) {
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const [stageSize, setStageSize] = React.useState<{ width: number; height: number } | null>(null)
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent || !document) return undefined
    const measure = () => {
      const style = window.getComputedStyle(parent)
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      const next = fitCutStage({
        width: Math.max(0, parent.clientWidth - horizontalPadding),
        height: Math.max(0, parent.clientHeight - verticalPadding)
      }, document.settings)
      setStageSize((current) => current?.width === next.width && current.height === next.height ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [document?.settings.width, document?.settings.height])
  if (!document) return <div className="preview-empty"><Film /><p>{emptyText}</p></div>
  const visualClips = document.tracks.filter((track) => track.kind === 'visual' && !track.hidden)
    .flatMap((track) => track.clips.map((clip) => ({ clip, muted: track.muted })))
    .filter(({ clip }) => playhead >= clip.start && playhead < clip.start + clip.duration)
  const stagedVisualClips = document.tracks.filter((track) => track.kind === 'visual' && !track.hidden)
    .flatMap((track) => track.clips.map((clip) => ({ clip, muted: track.muted })))
    .filter(({ clip }) => (playhead >= clip.start && playhead < clip.start + clip.duration) || shouldMountPreviewMedia(clip, playhead))
  const stagedAudioClips = document.tracks.filter((track) => track.kind === 'audio' && !track.muted)
    .flatMap((track) => track.clips)
    .filter((clip) => shouldMountPreviewMedia(clip, playhead))
  return <div ref={canvasRef} className="stage-canvas" style={{
    width: stageSize ? `${stageSize.width}px` : '100%',
    height: stageSize ? `${stageSize.height}px` : '100%',
    aspectRatio: `${document.settings.width} / ${document.settings.height}`,
    background: document.settings.background,
    transform: `scale(${zoom})`
  }}>
    {!visualClips.length && <div className="preview-empty"><Film /><p>{emptyText}</p></div>}
    {stagedVisualClips.map(({ clip, muted }) => {
      const active = playhead >= clip.start && playhead < clip.start + clip.duration
      return <StageLayer key={clip.id} clip={clip} document={document} playhead={playhead} playing={playing} active={active} muted={muted} selected={active && selectedClipIds.includes(clip.id)} onSelect={() => onSelect(clip.id)} onTransform={(transform) => onTransform(clip.id, transform)} onState={onState} />
    })}
    {stagedAudioClips.map((clip) => {
      const active = playhead >= clip.start && playhead < clip.start + clip.duration
      return clip.previewUrl ? <StageAudio key={clip.id} clip={clip} playhead={playhead} playing={playing} active={active} onState={onState} /> : null
    })}
  </div>
}

function StageLayer({ clip, document, playhead, playing, active, muted, selected, onSelect, onTransform, onState }: {
  clip: CutClip; document: CutDocument; playhead: number; playing: boolean; active: boolean; muted: boolean; selected: boolean; onSelect: () => void
  onTransform: (transform: NonNullable<CutClip['transform']>) => void; onState: (state: string, mediaAssetId?: string, sourceUrl?: string) => void
}) {
  const transform = clip.transform ?? { x: 0, y: 0, width: document.settings.width, height: document.settings.height, rotation: 0, opacity: 1 }
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const sessionRef = React.useRef<CanvasTransformSession | null>(null)
  const [liveTransform, setLiveTransform] = React.useState(transform)
  const liveTransformRef = React.useRef(transform)
  React.useEffect(() => {
    if (sessionRef.current) return
    liveTransformRef.current = transform
    setLiveTransform(transform)
  }, [transform.x, transform.y, transform.width, transform.height, transform.rotation, transform.opacity])

  const beginCanvasInteraction = (event: React.PointerEvent<HTMLElement>, mode: CanvasTransformMode) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect()
    const root = rootRef.current
    const canvas = root?.parentElement
    const rect = canvas?.getBoundingClientRect()
    if (!root || !rect || rect.width <= 0 || rect.height <= 0) return
    const current = liveTransformRef.current
    const centerClientX = rect.left + (current.x + current.width / 2) / document.settings.width * rect.width
    const centerClientY = rect.top + (current.y + current.height / 2) / document.settings.height * rect.height
    sessionRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAngle: Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX),
      centerClientX,
      centerClientY,
      scaleX: document.settings.width / rect.width,
      scaleY: document.settings.height / rect.height,
      startTransform: current,
      changed: false
    }
    root.setPointerCapture(event.pointerId)
  }

  const moveCanvasInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    const clientDeltaX = event.clientX - session.startClientX
    const clientDeltaY = event.clientY - session.startClientY
    if (Math.abs(clientDeltaX) + Math.abs(clientDeltaY) > 0.75) session.changed = true
    let next = session.startTransform
    if (session.mode === 'move') {
      next = moveCutTransform(session.startTransform, clientDeltaX * session.scaleX, clientDeltaY * session.scaleY, document.settings)
    } else if (session.mode === 'rotate') {
      next = rotateCutTransform(session.startTransform, session.startAngle, Math.atan2(event.clientY - session.centerClientY, event.clientX - session.centerClientX))
    } else {
      next = resizeCutTransform(session.startTransform, session.mode, clientDeltaX * session.scaleX, clientDeltaY * session.scaleY, document.settings)
    }
    liveTransformRef.current = next
    setLiveTransform(next)
  }

  const endCanvasInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    if (rootRef.current?.hasPointerCapture(event.pointerId)) rootRef.current.releasePointerCapture(event.pointerId)
    sessionRef.current = null
    if (session.changed) onTransform(liveTransformRef.current)
  }

  const cancelCanvasInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    liveTransformRef.current = session.startTransform
    setLiveTransform(session.startTransform)
    sessionRef.current = null
  }
  const localTime = playhead - clip.start
  const fadeInOpacity = clip.fadeIn ? Math.min(1, localTime / clip.fadeIn) : 1
  const fadeOutOpacity = clip.fadeOut ? Math.min(1, (clip.duration - localTime) / clip.fadeOut) : 1
  const transition = transitionState(clip, localTime)
  const style: React.CSSProperties = {
    left: `${liveTransform.x / document.settings.width * 100}%`, top: `${liveTransform.y / document.settings.height * 100}%`,
    width: `${liveTransform.width / document.settings.width * 100}%`, height: `${liveTransform.height / document.settings.height * 100}%`,
    opacity: active ? liveTransform.opacity * fadeInOpacity * fadeOutOpacity * transition.opacity : 0,
    pointerEvents: active ? 'auto' : 'none',
    visibility: active ? 'visible' : 'hidden',
    transform: `translateX(${transition.offsetX * 100}%) scale(${transition.scale}) rotate(${liveTransform.rotation}deg)`
  }
  const contentStyle: React.CSSProperties = {
    filter: effectsToCss(clip.effects), mixBlendMode: clip.blendMode ?? 'normal', clipPath: maskToCss(clip.mask)
  }
  const mediaStyle: React.CSSProperties = { objectFit: mediaObjectFit(clip.mediaFit) }
  return <div ref={rootRef} className={`stage-layer ${selected ? 'selected' : ''}`} style={style} onPointerDown={(event) => beginCanvasInteraction(event, 'move')} onPointerMove={moveCanvasInteraction} onPointerUp={endCanvasInteraction} onPointerCancel={cancelCanvasInteraction}>
    <div className="stage-layer-content" style={contentStyle}>
      {clip.type === 'video' && clip.previewUrl ? <StageVideo clip={clip} playhead={playhead} playing={playing} active={active} muted={muted || Boolean(clip.audioDetached)} onState={onState} /> : null}
      {clip.type === 'image' && clip.previewUrl ? <img src={clip.previewUrl} style={mediaStyle} crossOrigin="use-credentials" draggable={false} alt={clip.name} onLoad={() => onState('loaded', clip.mediaAssetId, clip.previewUrl)} onError={() => onState('error', clip.mediaAssetId, clip.previewUrl)} /> : null}
      {clip.type === 'color' ? <div className="stage-color" style={{ background: clip.color ?? '#111827' }} /> : null}
      {clip.type === 'text' ? <div className="stage-text" style={{ color: clip.color ?? '#f8fafc', fontSize: clip.fontSize ? `${Math.max(12, clip.fontSize / document.settings.width * 72)}px` : clip.name.toLowerCase().includes('heading') ? 'clamp(22px,5vw,72px)' : 'clamp(16px,3vw,42px)', fontWeight: clip.fontWeight ?? 750, textAlign: clip.textAlign ?? 'center' }}>{clip.text ?? clip.name}</div> : null}
    </div>
    {selected && <React.Fragment>
      <span className="canvas-rotation-stem" aria-hidden="true" />
      <span className="canvas-transform-handle rotate" aria-hidden="true" onPointerDown={(event) => beginCanvasInteraction(event, 'rotate')} />
      {(['north-west', 'north-east', 'south-west', 'south-east'] as const).map((handle) => <span key={handle} className={`canvas-transform-handle ${handle}`} aria-hidden="true" onPointerDown={(event) => beginCanvasInteraction(event, handle)} />)}
    </React.Fragment>}
  </div>
}

function StageVideo({ clip, playhead, playing, active, muted, onState }: { clip: CutClip; playhead: number; playing: boolean; active: boolean; muted: boolean; onState: (state: string, mediaAssetId?: string, sourceUrl?: string) => void }) {
  const ref = React.useRef<HTMLVideoElement | null>(null)
  const previousPlayheadRef = React.useRef(playhead)
  const wasPlayingRef = React.useRef(false)
  const playRequestRef = React.useRef<Promise<void> | null>(null)
  React.useEffect(() => {
    const video = ref.current
    return () => {
      if (video) releasePreviewCapturedAudio(video)
    }
  }, [])
  React.useEffect(() => {
    const video = ref.current
    if (!video) return
    const target = Math.max(0, clip.trimIn + (playhead - clip.start) * (clip.playbackRate ?? 1))
    const shouldSeek = shouldSeekPreviewMedia({
      playing,
      wasPlaying: wasPlayingRef.current,
      playhead,
      previousPlayhead: previousPlayheadRef.current,
      currentTime: video.currentTime,
      targetTime: target
    })
    if (shouldSeek) {
      cutDebug.debug('preview.video-seek', { clipId: clip.id, playing, target: Math.round(target * 1_000) / 1_000 })
      video.currentTime = Math.max(0, target)
    }
    video.playbackRate = clip.playbackRate ?? 1
    const requestedVolume = clamp(clip.volume ?? 1, 0, 1)
    const capturedAudio = setPreviewCapturedAudioGain(video, active && !muted ? requestedVolume : 0)
    video.volume = capturedAudio ? 1 : active ? requestedVolume : 0
    video.muted = capturedAudio || muted || requestedVolume === 0
    if (playing && (shouldSeek || video.paused) && !playRequestRef.current) {
      const request = video.play()
      playRequestRef.current = request
      void request.catch((error) => cutDebug.warn(`preview.video-play-failed: ${errorText(error)}`)).finally(() => {
        if (playRequestRef.current === request) playRequestRef.current = null
      })
    } else if (!playing) {
      video.pause()
      playRequestRef.current = null
    }
    previousPlayheadRef.current = playhead
    wasPlayingRef.current = playing
  }, [active, clip, muted, playhead, playing])
  return <video ref={ref} src={clip.previewUrl} style={{ objectFit: mediaObjectFit(clip.mediaFit) }} crossOrigin="use-credentials" playsInline onLoadStart={() => onState('loading', clip.mediaAssetId, clip.previewUrl)} onLoadedData={() => onState('loaded', clip.mediaAssetId, clip.previewUrl)} onError={() => onState('error', clip.mediaAssetId, clip.previewUrl)} />
}

function StageAudio({ clip, playhead, playing, active, onState }: { clip: CutClip; playhead: number; playing: boolean; active: boolean; onState: (state: string, mediaAssetId?: string, sourceUrl?: string) => void }) {
  const ref = React.useRef<HTMLAudioElement | null>(null)
  const previousPlayheadRef = React.useRef(playhead)
  const wasPlayingRef = React.useRef(false)
  const playRequestRef = React.useRef<Promise<void> | null>(null)
  React.useEffect(() => {
    const audio = ref.current
    return () => {
      if (audio) releasePreviewCapturedAudio(audio)
    }
  }, [])
  React.useEffect(() => {
    const audio = ref.current
    if (!audio) return
    const target = Math.max(0, clip.trimIn + (playhead - clip.start) * (clip.playbackRate ?? 1))
    const shouldSeek = shouldSeekPreviewMedia({
      playing,
      wasPlaying: wasPlayingRef.current,
      playhead,
      previousPlayhead: previousPlayheadRef.current,
      currentTime: audio.currentTime,
      targetTime: target
    })
    if (shouldSeek) {
      cutDebug.debug('preview.audio-seek', { clipId: clip.id, playing, target: Math.round(target * 1_000) / 1_000 })
      audio.currentTime = Math.max(0, target)
    }
    audio.playbackRate = clip.playbackRate ?? 1
    const requestedVolume = clamp(clip.volume ?? 1, 0, 1)
    const capturedAudio = setPreviewCapturedAudioGain(audio, active ? requestedVolume : 0)
    audio.volume = capturedAudio ? 1 : active ? requestedVolume : 0
    audio.muted = capturedAudio
    if (playing && (shouldSeek || audio.paused) && !playRequestRef.current) {
      const request = audio.play()
      playRequestRef.current = request
      void request.catch((error) => cutDebug.warn(`preview.audio-play-failed: ${errorText(error)}`)).finally(() => {
        if (playRequestRef.current === request) playRequestRef.current = null
      })
    } else if (!playing) {
      audio.pause()
      playRequestRef.current = null
    }
    previousPlayheadRef.current = playhead
    wasPlayingRef.current = playing
  }, [active, clip, playhead, playing])
  return <audio ref={ref} src={clip.previewUrl} crossOrigin="use-credentials" className="stage-audio" onLoadedData={() => onState('loaded', clip.mediaAssetId, clip.previewUrl)} onError={() => onState('error', clip.mediaAssetId, clip.previewUrl)} />
}

/**
 * Chromium may pause a pre-rolled media element when it becomes audible.
 * Keep the element muted and route its captured raw audio through a gain node,
 * so gaps stay silent without interrupting the media clock at clip boundaries.
 */
type CaptureStreamMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream
}

type PreviewCapturedAudioRoute = {
  source: MediaStreamAudioSourceNode
  gain: GainNode
}

let previewCapturedAudioContext: AudioContext | null = null
const previewCapturedAudioRoutes = new WeakMap<HTMLMediaElement, PreviewCapturedAudioRoute>()
const previewCapturedAudioWarnings = new WeakSet<HTMLMediaElement>()

function ensurePreviewCapturedAudioContext() {
  previewCapturedAudioContext ??= new AudioContext()
  return previewCapturedAudioContext
}

function setPreviewCapturedAudioGain(media: HTMLMediaElement, volume: number) {
  let route = previewCapturedAudioRoutes.get(media)
  if (!route) {
    const captureStream = (media as CaptureStreamMediaElement).captureStream
    if (!captureStream) return false
    try {
      const stream = captureStream.call(media)
      // Chromium can expose captureStream() before the decoded audio track is
      // attached. Keep native element audio until a later playback update can
      // establish the captured route; an empty stream is not a routing error.
      if (!stream.getAudioTracks().length) return false
      const context = ensurePreviewCapturedAudioContext()
      const source = context.createMediaStreamSource(stream)
      const gain = context.createGain()
      source.connect(gain).connect(context.destination)
      route = { source, gain }
      previewCapturedAudioRoutes.set(media, route)
    } catch (error) {
      if (!previewCapturedAudioWarnings.has(media)) {
        previewCapturedAudioWarnings.add(media)
        cutDebug.warn(`preview.captured-audio-routing-failed: ${errorText(error)}`)
      }
      return false
    }
  }
  const context = ensurePreviewCapturedAudioContext()
  route.gain.gain.setValueAtTime(clamp(volume, 0, 1), context.currentTime)
  return true
}

function resumePreviewCapturedAudio() {
  const context = ensurePreviewCapturedAudioContext()
  if (context.state === 'suspended') {
    void context.resume().catch((error) => cutDebug.warn(`preview.captured-audio-resume-failed: ${errorText(error)}`))
  }
}

function releasePreviewCapturedAudio(media: HTMLMediaElement) {
  const route = previewCapturedAudioRoutes.get(media)
  if (!route) return
  route.source.disconnect()
  route.gain.disconnect()
  previewCapturedAudioRoutes.delete(media)
}

function ClipInspector({ clip, document, t, onChange, onDuplicate, onDelete, onRestoreSourceDuration, restoringDuration }: {
  clip: CutClip; document: CutDocument; t: Translator; onChange: (update: (clip: CutClip) => CutClip) => void; onDuplicate: () => void; onDelete: () => void
  onRestoreSourceDuration: () => void; restoringDuration: boolean
}) {
  const transform = clip.transform
  return <div className="inspector-form">
    <section><div className="inspector-section-title"><span>{t('clip')}</span><Badge variant="secondary">{clip.type}</Badge></div>
      <label><span>{t('start')}</span><NumberInput value={clip.start} step={0.033} min={0} max={document.settings.durationSeconds - clip.duration} onValue={(value) => onChange((item) => ({ ...item, start: roundTime(clamp(value, 0, document.settings.durationSeconds - item.duration)) }))} /></label>
      <label><span>{t('duration')}</span><NumberInput value={clip.duration} step={0.033} min={MIN_CLIP_DURATION} max={document.settings.durationSeconds - clip.start} onValue={(value) => onChange((item) => {
        const duration = roundTime(clamp(value, MIN_CLIP_DURATION, document.settings.durationSeconds - item.start))
        return { ...item, duration, trimOut: roundTime(item.trimIn + duration) }
      })} /></label>
      <label><span>{t('fadeIn')}</span><NumberInput value={clip.fadeIn ?? 0} step={0.1} min={0} max={clip.duration / 2} onValue={(value) => onChange((item) => ({ ...item, fadeIn: clamp(value, 0, item.duration / 2) }))} /></label>
      <label><span>{t('fadeOut')}</span><NumberInput value={clip.fadeOut ?? 0} step={0.1} min={0} max={clip.duration / 2} onValue={(value) => onChange((item) => ({ ...item, fadeOut: clamp(value, 0, item.duration / 2) }))} /></label>
    </section>
    {(clip.type === 'video' || clip.type === 'audio') && <section><div className="inspector-section-title">{t('audio')}</div>
      <label><span>{t('volume')}</span><NumberInput value={clip.volume ?? 1} step={0.1} min={0} max={2} onValue={(value) => onChange((item) => ({ ...item, volume: clamp(value, 0, 2) }))} /></label>
      <label><span>{t('speed')}</span><NumberInput value={clip.playbackRate ?? 1} step={0.25} min={0.1} max={8} onValue={(value) => onChange((item) => ({ ...item, playbackRate: clamp(value, 0.1, 8) }))} /></label>
      {clip.previewUrl && <Button variant="outline" size="sm" disabled={restoringDuration} onClick={onRestoreSourceDuration}><RotateCcw />{restoringDuration ? t('matchingSourceDuration') : t('matchSourceDuration')}</Button>}
    </section>}
    {clip.type === 'text' && <section><div className="inspector-section-title">{t('text')}</div>
      <label className="stacked"><span>{t('content')}</span><Input value={clip.text ?? ''} onChange={(event) => onChange((item) => ({ ...item, text: event.target.value, name: event.target.value || item.name }))} /></label>
      <label><span>{t('fontSize')}</span><NumberInput value={clip.fontSize ?? document.settings.height * 0.08} step={1} min={1} max={1000} onValue={(value) => onChange((item) => ({ ...item, fontSize: value }))} /></label>
      <ColorField label={t('color')} value={clip.color ?? '#f8fafc'} onValue={(value) => onChange((item) => ({ ...item, color: value }))} />
    </section>}
    {clip.type === 'color' && <section><ColorField label={t('color')} value={clip.color ?? '#111827'} onValue={(value) => onChange((item) => ({ ...item, color: value }))} /></section>}
    {transform && <section><div className="inspector-section-title">{t('transform')}</div><div className="field-grid">
      <label><span>{t('positionX')}</span><NumberInput value={transform.x} step={1} onValue={(value) => onChange((item) => ({ ...item, transform: item.transform ? { ...item.transform, x: value } : undefined }))} /></label>
      <label><span>{t('positionY')}</span><NumberInput value={transform.y} step={1} onValue={(value) => onChange((item) => ({ ...item, transform: item.transform ? { ...item.transform, y: value } : undefined }))} /></label>
      <label><span>{t('width')}</span><NumberInput value={transform.width} step={1} min={1} onValue={(value) => onChange((item) => ({ ...item, transform: item.transform ? { ...item.transform, width: Math.max(1, value) } : undefined }))} /></label>
      <label><span>{t('height')}</span><NumberInput value={transform.height} step={1} min={1} onValue={(value) => onChange((item) => ({ ...item, transform: item.transform ? { ...item.transform, height: Math.max(1, value) } : undefined }))} /></label>
      <label><span>{t('rotation')}</span><NumberInput value={transform.rotation} step={1} onValue={(value) => onChange((item) => ({ ...item, transform: item.transform ? { ...item.transform, rotation: value } : undefined }))} /></label>
      <label><span>{t('opacity')}</span><NumberInput value={transform.opacity} step={0.05} min={0} max={1} onValue={(value) => onChange((item) => ({ ...item, transform: item.transform ? { ...item.transform, opacity: clamp(value, 0, 1) } : undefined }))} /></label>
    </div>{(clip.type === 'video' || clip.type === 'image') && <label><span>{t('mediaFit')}</span><select className="compact-select" value={clip.mediaFit ?? 'cover'} onChange={(event) => {
      const mediaFit = event.target.value as NonNullable<CutClip['mediaFit']>
      onChange((item) => ({ ...item, mediaFit }))
    }}><option value="cover">{t('cover')}</option><option value="contain">{t('contain')}</option><option value="stretch">{t('stretch')}</option></select></label>}</section>}
    {clip.type !== 'audio' && <section><div className="inspector-section-title">{t('transitions')}</div>
      <label><span>{t('transitionIn')}</span><select className="compact-select" value={clip.transitionIn?.type ?? 'none'} onChange={(event) => {
        const type = readTransitionType(event.target.value)
        onChange((item) => ({ ...item, transitionIn: type ? { type, duration: item.transitionIn?.duration ?? 0.5 } : undefined }))
      }}><option value="none">{t('none')}</option>{TRANSITION_TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      {clip.transitionIn && <label><span>{t('duration')}</span><NumberInput value={clip.transitionIn.duration} step={0.1} min={0.05} max={Math.min(10, clip.duration)} onValue={(value) => onChange((item) => ({ ...item, transitionIn: item.transitionIn ? { ...item.transitionIn, duration: clamp(value, 0.05, Math.min(10, item.duration)) } : undefined }))} /></label>}
      <label><span>{t('transitionOut')}</span><select className="compact-select" value={clip.transitionOut?.type ?? 'none'} onChange={(event) => {
        const type = readTransitionType(event.target.value)
        onChange((item) => ({ ...item, transitionOut: type ? { type, duration: item.transitionOut?.duration ?? 0.5 } : undefined }))
      }}><option value="none">{t('none')}</option>{TRANSITION_TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      {clip.transitionOut && <label><span>{t('duration')}</span><NumberInput value={clip.transitionOut.duration} step={0.1} min={0.05} max={Math.min(10, clip.duration)} onValue={(value) => onChange((item) => ({ ...item, transitionOut: item.transitionOut ? { ...item.transitionOut, duration: clamp(value, 0.05, Math.min(10, item.duration)) } : undefined }))} /></label>}
    </section>}
    {clip.type !== 'audio' && <section><div className="inspector-section-title">{t('blending')}</div>
      <label><span>{t('blendMode')}</span><select className="compact-select" value={clip.blendMode ?? 'normal'} onChange={(event) => {
        const blendMode = readBlendMode(event.target.value)
        if (blendMode) onChange((item) => ({ ...item, blendMode }))
      }}>{BLEND_MODES.map((mode) => <option key={mode} value={mode}>{t(mode)}</option>)}</select></label>
    </section>}
    {clip.type !== 'audio' && <section><div className="inspector-section-title">{t('mask')}</div>
      <label><span>{t('shape')}</span><select className="compact-select" value={clip.mask?.shape ?? 'none'} onChange={(event) => {
        const shape = readMaskShape(event.target.value)
        if (shape) onChange((item) => ({ ...item, mask: { shape, inset: item.mask?.inset ?? 0, radius: item.mask?.radius ?? 0.12 } }))
      }}>{MASK_SHAPES.map((shape) => <option key={shape} value={shape}>{t(shape)}</option>)}</select></label>
      {(clip.mask?.shape ?? 'none') !== 'none' && <label><span>{t('inset')}</span><NumberInput value={(clip.mask?.inset ?? 0) * 100} step={1} min={0} max={49} onValue={(value) => onChange((item) => ({ ...item, mask: { shape: item.mask?.shape ?? 'rectangle', inset: clamp(value / 100, 0, 0.49), radius: item.mask?.radius ?? 0.12 } }))} /></label>}
      {clip.mask?.shape === 'rounded' && <label><span>{t('radius')}</span><NumberInput value={clip.mask.radius * 100} step={1} min={0} max={100} onValue={(value) => onChange((item) => ({ ...item, mask: { shape: item.mask?.shape ?? 'rounded', inset: item.mask?.inset ?? 0, radius: clamp(value / 100, 0, 1) } }))} /></label>}
    </section>}
    {clip.type !== 'audio' && <section><div className="inspector-section-title">{t('adjustment')}</div>
      <label><span>{t('effectPunch')}</span><NumberInput value={clip.effects?.contrast ?? 1} step={0.05} min={0} max={4} onValue={(value) => onChange((item) => ({ ...item, effects: { ...(item.effects ?? DEFAULT_EFFECTS), contrast: clamp(value, 0, 4) } }))} /></label>
      <label><span>{t('effectWarm')}</span><NumberInput value={clip.effects?.saturation ?? 1} step={0.05} min={0} max={4} onValue={(value) => onChange((item) => ({ ...item, effects: { ...(item.effects ?? DEFAULT_EFFECTS), saturation: clamp(value, 0, 4) } }))} /></label>
    </section>}
    <div className="inspector-actions"><Button variant="outline" size="sm" onClick={onDuplicate}><CopyPlus />{t('duplicate')}</Button><Button variant="destructive" size="sm" onClick={onDelete}><Trash2 />{t('delete')}</Button></div>
  </div>
}

function ProjectInspector({ document, t, onChange }: { document: CutDocument; t: Translator; onChange: (settings: Partial<CutDocument['settings']>) => void }) {
  return <div className="inspector-form"><section><div className="inspector-section-title">{t('projectSettings')}</div>
    <div className="field-grid"><label><span>{t('width')}</span><NumberInput value={document.settings.width} min={16} max={7680} step={16} onValue={(width) => onChange({ width })} /></label>
      <label><span>{t('height')}</span><NumberInput value={document.settings.height} min={16} max={4320} step={16} onValue={(height) => onChange({ height })} /></label>
      <label><span>{t('fps')}</span><NumberInput value={document.settings.fps} min={1} max={120} step={1} onValue={(fps) => onChange({ fps })} /></label>
    </div><ColorField label={t('background')} value={document.settings.background} onValue={(background) => onChange({ background })} />
  </section></div>
}

function NumberInput({ value, onValue, ...props }: { value: number; onValue: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <Input type="number" value={Number.isFinite(value) ? roundTime(value) : 0} onChange={(event) => {
    const next = Number(event.target.value)
    if (Number.isFinite(next)) onValue(next)
  }} {...props} />
}

function ColorField({ label, value, onValue }: { label: string; value: string; onValue: (value: string) => void }) {
  return <label className="color-field"><span>{label}</span><span><input type="color" value={normalizeHex(value)} onChange={(event) => onValue(event.target.value)} /><Input value={value} onChange={(event) => onValue(event.target.value)} /></span></label>
}

function AudioWaveform({ clip }: { clip: CutClip }) {
  const fallback = React.useMemo(() => fallbackWaveform(clip.id), [clip.id])
  const [bars, setBars] = React.useState(fallback)
  const [source, setSource] = React.useState<'fallback' | 'decoded'>('fallback')
  React.useEffect(() => {
    if (!clip.previewUrl || typeof AudioContext === 'undefined') {
      setBars(fallback)
      setSource('fallback')
      return undefined
    }
    let cancelled = false
    const loadWaveform = async () => {
      const context = new AudioContext()
      try {
        const response = await fetch(clip.previewUrl!, { credentials: 'include' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await context.decodeAudioData(await response.arrayBuffer())
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
        const startFrame = clip.trimIn * buffer.sampleRate
        const sourceDuration = clip.duration * (clip.playbackRate ?? 1)
        const peaks = computeCutWaveform(channels, startFrame, startFrame + sourceDuration * buffer.sampleRate, 32)
        if (!cancelled && peaks.length) {
          setBars(peaks.map((peak) => 16 + peak * 82))
          setSource('decoded')
        }
      } catch (error) {
        cutDebug.debug('waveform.decode-skipped', { clipId: clip.id, reason: errorText(error) })
        if (!cancelled) {
          setBars(fallback)
          setSource('fallback')
        }
      } finally {
        await context.close().catch(() => undefined)
      }
    }
    void loadWaveform()
    return () => { cancelled = true }
  }, [clip.duration, clip.id, clip.playbackRate, clip.previewUrl, clip.trimIn, fallback])
  return <span className="audio-waveform" data-waveform-source={source} aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</span>
}

function fallbackWaveform(seed: string) {
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return Array.from({ length: 32 }, (_, index) => 24 + ((hash >>> (index % 16)) + index * 19) % 72)
}

function ClipGlyph({ type }: { type: CutClip['type'] }) {
  if (type === 'audio') return <Music2 />
  if (type === 'text') return <Type />
  if (type === 'video') return <Film />
  if (type === 'image') return <Image />
  return <Layers3 />
}

function readBlendMode(value: string): NonNullable<CutClip['blendMode']> | null {
  return BLEND_MODES.find((mode) => mode === value) ?? null
}

function readMaskShape(value: string): NonNullable<CutClip['mask']>['shape'] | null {
  return MASK_SHAPES.find((shape) => shape === value) ?? null
}

function readTransitionType(value: string): NonNullable<CutClip['transitionIn']>['type'] | null {
  return TRANSITION_TYPES.find((type) => type === value) ?? null
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && (error.name === 'AbortError' || /cancelled/i.test(error.message))
}

function beginTrim(
  event: React.PointerEvent<HTMLSpanElement>, mode: 'trim-start' | 'trim-end', clip: CutClip, document: CutDocument | null,
  projectDuration: number, pixelsPerSecond: number, snapping: boolean, ripple: boolean, playhead: number,
  dragRef: React.MutableRefObject<DragSession | null>, select: (id: string) => void
) {
  event.stopPropagation()
  if (!document) return
  select(clip.id)
  dragRef.current = {
    mode, clipId: clip.id, startX: event.clientX, initialStart: clip.start, initialDuration: clip.duration,
    initialTrimIn: clip.trimIn, initialTrimOut: clip.trimOut, projectDuration, pixelsPerSecond,
    snapping, ripple, snapPoints: collectSnapPoints(document, clip.id, playhead),
    original: structuredClone(document), changed: false
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function applyDragPreview(drag: DragSession, clientX: number): CutDocument {
  const document = structuredClone(drag.original)
  const located = findClipLocation(document, drag.clipId)
  if (!located) return document
  const { clip, track } = located
  const deltaSeconds = (clientX - drag.startX) / drag.pixelsPerSecond
  const threshold = 8 / drag.pixelsPerSecond
  if (drag.mode === 'move') {
    const rawStart = clipStartFromDrag({
      initialStart: drag.initialStart, deltaPixels: clientX - drag.startX, pixelsPerSecond: drag.pixelsPerSecond,
      clipDuration: drag.initialDuration, projectDuration: drag.projectDuration
    })
    const start = drag.snapping
      ? snapClipStart(rawStart, drag.initialDuration, drag.snapPoints, threshold, drag.projectDuration)
      : rawStart
    clip.start = roundTime(start)
    return document
  }
  if (drag.mode === 'trim-start') {
    const end = drag.initialStart + drag.initialDuration
    const minStart = Math.max(0, drag.initialStart - drag.initialTrimIn)
    const rawStart = clamp(drag.initialStart + deltaSeconds, minStart, end - MIN_CLIP_DURATION)
    const start = drag.snapping ? clamp(snapEdge(rawStart, drag.snapPoints, threshold), minStart, end - MIN_CLIP_DURATION) : rawStart
    const delta = start - drag.initialStart
    clip.start = roundTime(start)
    clip.duration = roundTime(end - start)
    clip.trimIn = roundTime(drag.initialTrimIn + delta)
    return document
  }
  const originalEnd = drag.initialStart + drag.initialDuration
  let rawEnd = clamp(originalEnd + deltaSeconds, drag.initialStart + MIN_CLIP_DURATION, drag.projectDuration)
  if (drag.snapping) rawEnd = clamp(snapEdge(rawEnd, drag.snapPoints, threshold), drag.initialStart + MIN_CLIP_DURATION, drag.projectDuration)
  let duration = rawEnd - drag.initialStart
  const laterClips = track.clips.filter((item) => item.id !== clip.id && item.start >= originalEnd - 0.001)
  if (drag.ripple && laterClips.length) {
    const requestedDelta = duration - drag.initialDuration
    const positiveLimit = Math.min(...laterClips.map((item) => drag.projectDuration - item.start - item.duration))
    const appliedDelta = requestedDelta > 0 ? Math.min(requestedDelta, positiveLimit) : requestedDelta
    duration = drag.initialDuration + appliedDelta
    for (const item of laterClips) item.start = roundTime(item.start + appliedDelta)
  }
  clip.duration = roundTime(duration)
  clip.trimOut = roundTime(drag.initialTrimIn + duration)
  track.clips.sort((a, b) => a.start - b.start)
  return document
}

function findClipLocation(document: CutDocument, clipId: string) {
  for (const track of document.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}

function collectSnapPoints(document: CutDocument, clipId: string, playhead: number) {
  const points = new Set<number>([0, document.settings.durationSeconds, roundTime(playhead)])
  for (const clip of document.tracks.flatMap((track) => track.clips)) {
    if (clip.id === clipId) continue
    points.add(roundTime(clip.start))
    points.add(roundTime(clip.start + clip.duration))
  }
  return [...points].sort((a, b) => a - b)
}

function snapClipStart(start: number, duration: number, points: number[], threshold: number, projectDuration: number) {
  let candidate = start
  let distance = threshold
  for (const point of points) {
    for (const proposed of [point, point - duration]) {
      const nextDistance = Math.abs(proposed - start)
      if (nextDistance <= distance && proposed >= 0 && proposed + duration <= projectDuration) {
        candidate = proposed
        distance = nextDistance
      }
    }
  }
  return candidate
}

function snapEdge(value: number, points: number[], threshold: number) {
  let candidate = value
  let distance = threshold
  for (const point of points) {
    const nextDistance = Math.abs(point - value)
    if (nextDistance <= distance) {
      candidate = point
      distance = nextDistance
    }
  }
  return candidate
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let index = 0
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      if (item) await operation(item)
    }
  })
  await Promise.all(workers)
}

function parseMediaAccessGrant(value: RemoteValue | null): MediaAccessGrant {
  if (!isRemoteObject(value)
    || typeof value.url !== 'string'
    || typeof value.expiresAt !== 'string'
    || typeof value.fileName !== 'string'
    || typeof value.mimeType !== 'string'
    || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new Error('The host returned an invalid media access grant.')
  }
  return {
    url: value.url,
    expiresAt: value.expiresAt,
    fileName: value.fileName,
    mimeType: value.mimeType,
    ...(typeof value.size === 'number' ? { size: value.size } : {})
  }
}

function applyMediaPreviewUrls(document: CutDocument, urls: Map<string, string>) {
  return {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.mediaAssetId && urls.has(clip.mediaAssetId)
        ? { ...clip, previewUrl: urls.get(clip.mediaAssetId)! }
        : clip)
    }))
  }
}

function mediaPreviewUrls(detail: ProjectDetail | null) {
  return new Map(detail?.media.flatMap((asset) => asset.id && asset.previewUrl ? [[asset.id, asset.previewUrl] as const] : []) ?? [])
}

function applyEvidencePreviewUrls(items: MediaEvidenceSummary[], urls: Map<string, string>) {
  return items.map((item) => {
    const url = urls.get(item.mediaAssetId)
    return url ? { ...item, thumbnail: { url, time: item.thumbnail?.time ?? item.start } } : item
  })
}

function applyProposalPreviewUrls(proposal: EditProposalReview, urls: Map<string, string>): EditProposalReview {
  return {
    ...proposal,
    item: {
      ...proposal.item,
      items: proposal.item.items.map((item) => ({
        ...item,
        evidence: item.evidence.map((evidence) => {
          const url = urls.get(evidence.mediaAssetId)
          return url ? { ...evidence, thumbnail: { url, time: evidence.thumbnail?.time ?? evidence.start } } : evidence
        })
      }))
    },
    preview: {
      ...proposal.preview,
      ...(proposal.preview.document ? { document: applyMediaPreviewUrls(proposal.preview.document, urls) } : {})
    }
  }
}

function coerceViewData(value: RemoteValue | null): CutViewData {
  if (!isRemoteObject(value) || !isRemoteObject(value.projects) || !Array.isArray(value.projects.items)) return EMPTY
  return {
    ...(value as unknown as CutViewData),
    captionDrafts: Array.isArray(value.captionDrafts) ? value.captionDrafts as CutViewData['captionDrafts'] : [],
    analysisJobs: coerceAnalysisJobs(value.analysisJobs),
    mediaSegments: Array.isArray(value.mediaSegments) ? value.mediaSegments as CutViewData['mediaSegments'] : [],
    editProposals: Array.isArray(value.editProposals) ? value.editProposals as CutViewData['editProposals'] : [],
    renderCapability: isRemoteObject(value.renderCapability) ? value.renderCapability as unknown as CutViewData['renderCapability'] : EMPTY.renderCapability
  }
}

function coerceAnalysisJobs(value: RemoteValue | undefined): AnalysisJobSummary[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRemoteObject(item)
      || typeof item.projectId !== 'string'
      || typeof item.type !== 'string'
      || !['local', 'server', 'import'].includes(String(item.executionMode))
      || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(item.status))
      || typeof item.progress !== 'number') return []
    const rawSettings = isRemoteObject(item.exportSettings) ? item.exportSettings : null
    const parsed: AnalysisJobSummary = {
      projectId: item.projectId,
      type: item.type,
      executionMode: item.executionMode === 'local' || item.executionMode === 'import' ? item.executionMode : 'server',
      status: item.status === 'queued' || item.status === 'running' || item.status === 'succeeded' || item.status === 'failed' ? item.status : 'cancelled',
      progress: item.progress,
      inputRevision: typeof item.inputRevision === 'number' ? item.inputRevision : 0,
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      mediaAssetId: remoteNullableString(item.mediaAssetId),
      language: remoteNullableString(item.language),
      model: remoteNullableString(item.model),
      resultTranscriptId: remoteNullableString(item.resultTranscriptId),
      resultExportId: remoteNullableString(item.resultExportId),
      sandboxJobId: remoteNullableString(item.sandboxJobId),
      stage: remoteNullableString(item.stage),
      variantName: remoteNullableString(item.variantName),
      ...(rawSettings ? { exportSettings: {
        format: rawSettings.format === 'webm' ? 'webm' : 'mp4',
        quality: rawSettings.quality === 'low' || rawSettings.quality === 'medium' || rawSettings.quality === 'very_high' ? rawSettings.quality : 'high',
        includeAudio: rawSettings.includeAudio !== false
      } } : {}),
      failureCode: remoteNullableString(item.failureCode),
      errorMessage: remoteNullableString(item.errorMessage),
      ...(typeof item.cancellationRequested === 'boolean' ? { cancellationRequested: item.cancellationRequested } : {})
    }
    return [parsed]
  })
}

function remoteNullableString(value: RemoteValue | undefined) {
  return typeof value === 'string' ? value : null
}

function coerceEditProposalReview(value: RemoteValue | null): EditProposalReview | null {
  if (isRemoteObject(value) && isRemoteObject(value.item) && isRemoteObject(value.preview) && Array.isArray(value.item.items)) {
    return value as unknown as EditProposalReview
  }
  if (isRemoteObject(value) && isRemoteObject(value.data)) return coerceEditProposalReview(value.data)
  return null
}

function coerceCaptionDraftPage(value: RemoteValue | null): CaptionDraftPage | null {
  if (isRemoteObject(value) && isRemoteObject(value.item) && Array.isArray(value.captions)) return value as unknown as CaptionDraftPage
  if (isRemoteObject(value) && isRemoteObject(value.data)) return coerceCaptionDraftPage(value.data)
  return null
}

function coerceDetail(value: RemoteValue | null): ProjectDetail | null {
  if (isRemoteObject(value) && isRemoteObject(value.item) && isRemoteObject(value.document)) return value as ProjectDetail
  if (isRemoteObject(value) && isRemoteObject(value.data)) return coerceDetail(value.data)
  return null
}

function readInitialProjectId(context: RemoteContext) {
  const selection = context.initialQuery?.selectionId
  return typeof selection === 'string' ? selection : null
}

function findClip(document: CutDocument, clipId: string) {
  return document.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId) ?? null
}

function firstClip(document: CutDocument) {
  return document.tracks.flatMap((track) => track.clips)[0] ?? null
}

function splitCaptionText(value: string): [string, string] | null {
  const text = value.trim()
  if (text.length < 2) return null
  const words = text.split(/\s+/)
  if (words.length > 1) {
    const middle = Math.ceil(words.length / 2)
    return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')]
  }
  const characters = [...text]
  const middle = Math.ceil(characters.length / 2)
  return [characters.slice(0, middle).join(''), characters.slice(middle).join('')]
}

function updateClip(document: CutDocument, clipId: string, update: (clip: CutClip) => CutClip): CutDocument {
  return { ...document, tracks: document.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === clipId ? update(clip) : clip) })) }
}

function updateTrack(document: CutDocument, trackId: string, update: (track: CutTrack) => CutTrack): CutDocument {
  return { ...document, tracks: document.tracks.map((track) => track.id === trackId ? update(track) : track) }
}

function appendClip(document: CutDocument, clip: CutClip, kind: CutTrack['kind'], targetTrackId?: string): CutDocument {
  const target = document.tracks.find((track) => track.id === targetTrackId && track.kind === kind)
    ?? document.tracks.find((track) => track.kind === kind)
  if (!target) return { ...document, tracks: [...document.tracks, { id: makeId(), name: kind === 'audio' ? 'Audio 1' : 'Video 1', kind, muted: false, hidden: false, clips: [clip] }] }
  return updateTrack(document, target.id, (track) => ({ ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) }))
}

function mediaDragKey(asset: MediaSummary) {
  return asset.id ?? `${asset.mimeType}:${asset.originalName}`
}

function rulerMarks(duration: number) {
  const interval = duration > 180 ? 30 : duration > 60 ? 10 : 5
  return Array.from({ length: Math.floor(duration / interval) + 1 }, (_, index) => index * interval)
}

function boundedStart(start: number, duration: number, projectDuration: number) { return roundTime(clamp(start, 0, Math.max(0, projectDuration - duration))) }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
function roundTime(value: number) { return Math.round(value * 1000) / 1000 }
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `cut-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function formatExportQuality(quality: CutExportSettings['quality'], t: Translator) {
  return t(quality === 'low' ? 'qualityLow' : quality === 'medium' ? 'qualityMedium' : quality === 'very_high' ? 'qualityVeryHigh' : 'qualityHigh')
}
function isWorkspaceMediaMissing(message?: string | null) {
  return Boolean(message && /workspace file not found|conversation file not found|unable to (?:read|resolve seekable input) media\//i.test(message))
}
function formatBackgroundJobError(message: string, t: Translator) {
  return isWorkspaceMediaMissing(message) ? t('workspaceMediaMissing') : message
}
function formatTime(time: number) { const minutes = Math.floor(time / 60); const seconds = time - minutes * 60; return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}` }
function safeFileName(value: string) { return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'cut-export' }
function formatBytes(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB` }
function normalizeHex(value: string) { return /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000' }
function effectsToCss(effects: CutClip['effects']) {
  if (!effects) return undefined
  return `brightness(${effects.brightness}) contrast(${effects.contrast}) saturate(${effects.saturation}) blur(${effects.blur}px) grayscale(${effects.grayscale}) sepia(${effects.sepia})`
}

function mediaObjectFit(fit: CutClip['mediaFit']): React.CSSProperties['objectFit'] {
  return fit === 'stretch' ? 'fill' : fit ?? 'cover'
}

function maskToCss(mask: CutClip['mask']) {
  if (!mask || mask.shape === 'none') return undefined
  const inset = clamp(mask.inset, 0, 0.49) * 100
  if (mask.shape === 'circle') return `circle(${Math.max(1, 50 - inset)}% at 50% 50%)`
  if (mask.shape === 'rounded') return `inset(${inset}% round ${clamp(mask.radius, 0, 1) * 50}%)`
  return `inset(${inset}%)`
}

function transitionState(clip: CutClip, localTime: number) {
  let opacity = 1
  let offsetX = 0
  let scale = 1
  const apply = (transition: CutClip['transitionIn'], progress: number, direction: -1 | 1) => {
    const bounded = clamp(progress, 0, 1)
    if (transition?.type === 'fade') opacity *= bounded
    if (transition?.type === 'slide') offsetX += (1 - bounded) * direction
    if (transition?.type === 'zoom') scale *= 0.82 + bounded * 0.18
  }
  if (clip.transitionIn && localTime < clip.transitionIn.duration) apply(clip.transitionIn, localTime / clip.transitionIn.duration, -1)
  const remaining = clip.duration - localTime
  if (clip.transitionOut && remaining < clip.transitionOut.duration) apply(clip.transitionOut, remaining / clip.transitionOut.duration, 1)
  return { opacity, offsetX, scale }
}

createRoot(document.getElementById('root')!).render(<App />)
