import * as React from 'react'
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch
} from '@xpert-ai/plugin-shadcn-ui'
import { FileText, Search, Settings2, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import type { CutMessageKey } from './cut-i18n'
import type { CutSpeechCleanupDeletion } from './cut-types'
import { errorText, executeAction, isRemoteObject, notify, responsePayload, type RemoteValue } from './runtime'

const h = React.createElement

type Translator = (key: CutMessageKey) => string
type CleanupMode = 'conservative' | 'balanced' | 'aggressive'

export type SpeechCleanupTranscriptOption = {
  id: string
  label: string
  mediaAssetId?: string | null
}

export type SpeechCleanupTextSelection = {
  transcriptId: string
  mediaAssetId?: string
  sourceStart: number
  sourceEnd: number
  text: string
}

type TranscriptWord = { start: number; end: number; text: string }
type TranscriptSegment = { id: string; start: number; end: number; text: string; words?: TranscriptWord[] | null }
type TranscriptPage = { items: TranscriptSegment[]; total: number }
type TranscriptToken = { id: string; start: number; end: number; text: string }
type SelectionToolbar = SpeechCleanupTextSelection & { left: number; top: number }

type CleanupSettings = {
  minimumSilenceSeconds: number
  maxRemovalRatio: number
  removeSilence: boolean
  removeFillers: boolean
  removeRepeatedPhrases: boolean
  removeStutters: boolean
}

const CLEANUP_PRESETS: Record<CleanupMode, CleanupSettings> = {
  conservative: { minimumSilenceSeconds: 1.2, maxRemovalRatio: 0.2, removeSilence: true, removeFillers: true, removeRepeatedPhrases: false, removeStutters: true },
  balanced: { minimumSilenceSeconds: 0.65, maxRemovalRatio: 0.35, removeSilence: true, removeFillers: true, removeRepeatedPhrases: true, removeStutters: true },
  aggressive: { minimumSilenceSeconds: 0.4, maxRemovalRatio: 0.5, removeSilence: true, removeFillers: true, removeRepeatedPhrases: true, removeStutters: true }
}

export function SmartSpeechCleanup({
  projectId,
  projectRevision,
  transcripts,
  scopeLabel,
  scopeMediaAssetId,
  deletions,
  disabled,
  proposalDisabled,
  t,
  onSelectionChange,
  onDeleteSelection,
  onProposalCreated
}: {
  projectId?: string
  projectRevision?: number
  transcripts: SpeechCleanupTranscriptOption[]
  scopeLabel: string
  scopeMediaAssetId?: string
  deletions: CutSpeechCleanupDeletion[]
  disabled: boolean
  proposalDisabled: boolean
  t: Translator
  onSelectionChange: (selection: SpeechCleanupTextSelection | null) => void
  onDeleteSelection: (selection: SpeechCleanupTextSelection) => boolean
  onProposalCreated: (proposalId: string) => Promise<void>
}) {
  const [transcriptId, setTranscriptId] = React.useState('')
  const [mode, setMode] = React.useState<CleanupMode>('balanced')
  const [settings, setSettings] = React.useState<CleanupSettings>(CLEANUP_PRESETS.balanced)
  const [segments, setSegments] = React.useState<TranscriptSegment[]>([])
  const [search, setSearch] = React.useState('')
  const [selectionToolbar, setSelectionToolbar] = React.useState<SelectionToolbar | null>(null)
  const [loadingTranscript, setLoadingTranscript] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const transcriptShellRef = React.useRef<HTMLDivElement | null>(null)
  const transcriptTextRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (transcriptId && transcripts.some((item) => item.id === transcriptId)) return
    setTranscriptId(transcripts[0]?.id ?? '')
  }, [transcriptId, transcripts])

  React.useEffect(() => {
    clearSelection(setSelectionToolbar, onSelectionChange)
    if (!projectId || !transcriptId) {
      setSegments([])
      return undefined
    }
    let cancelled = false
    setLoadingTranscript(true)
    void executeAction('cut_list_transcript_segments', projectId, { projectId, transcriptId, page: 1, pageSize: 200 })
      .then((response) => {
        if (cancelled) return
        const page = parseTranscriptPage(responsePayload(response))
        if (!page) throw new Error('Cut transcript response is invalid.')
        setSegments(page.items)
      })
      .catch((error) => {
        if (!cancelled) {
          setSegments([])
          notify('error', errorText(error))
        }
      })
      .finally(() => { if (!cancelled) setLoadingTranscript(false) })
    return () => { cancelled = true }
  }, [projectId, transcriptId])

  const selectedTranscript = transcripts.find((item) => item.id === transcriptId)
  const mediaAssetId = selectedTranscript?.mediaAssetId ?? scopeMediaAssetId
  const filteredSegments = segments.filter((segment) => !search.trim() || segment.text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const relevantDeletions = deletions.filter((item) => item.transcriptId === transcriptId && (!mediaAssetId || item.mediaAssetId === mediaAssetId))

  const selectMode = (value: string) => {
    if (value !== 'conservative' && value !== 'balanced' && value !== 'aggressive') return
    setMode(value)
    setSettings(CLEANUP_PRESETS[value])
  }

  const captureSelection = () => {
    const browserSelection = window.getSelection()
    const textRoot = transcriptTextRef.current
    const shell = transcriptShellRef.current
    if (!browserSelection || browserSelection.isCollapsed || browserSelection.rangeCount < 1 || !textRoot || !shell) {
      clearSelection(setSelectionToolbar, onSelectionChange)
      return
    }
    const range = browserSelection.getRangeAt(0)
    if (!textRoot.contains(range.commonAncestorContainer)) {
      clearSelection(setSelectionToolbar, onSelectionChange)
      return
    }
    const tokens = [...textRoot.querySelectorAll<HTMLElement>('[data-speech-token]')].filter((token) => {
      try { return range.intersectsNode(token) } catch { return false }
    })
    const sourceStart = Math.min(...tokens.map((token) => Number(token.dataset.start)).filter(Number.isFinite))
    const sourceEnd = Math.max(...tokens.map((token) => Number(token.dataset.end)).filter(Number.isFinite))
    const text = browserSelection.toString().trim()
    if (!tokens.length || !text || !Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) {
      clearSelection(setSelectionToolbar, onSelectionChange)
      return
    }
    const selectionRect = range.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const selection: SpeechCleanupTextSelection = {
      transcriptId,
      ...(mediaAssetId ? { mediaAssetId } : {}),
      sourceStart,
      sourceEnd,
      text
    }
    const toolbar: SelectionToolbar = {
      ...selection,
      left: shellRect.left + shellRect.width / 2,
      top: Math.max(8, selectionRect.top - 42)
    }
    setSelectionToolbar(toolbar)
    onSelectionChange(selection)
  }

  const deleteSelection = () => {
    if (!selectionToolbar || disabled) return
    if (!onDeleteSelection(selectionToolbar)) return
    clearSelection(setSelectionToolbar, onSelectionChange)
  }

  const createProposal = async () => {
    if (!projectId || projectRevision === undefined || !transcriptId || creating || proposalDisabled) return
    setCreating(true)
    try {
      const payload = responsePayload(await executeAction('cut_create_speech_cleanup_proposal', projectId, {
        projectId,
        transcriptId,
        sourceRevision: projectRevision,
        mode,
        minimumSilenceSeconds: settings.minimumSilenceSeconds,
        removeSilence: settings.removeSilence,
        removeFillers: settings.removeFillers,
        removeRepeatedPhrases: settings.removeRepeatedPhrases,
        removeStutters: settings.removeStutters,
        maxRemovalRatio: settings.maxRemovalRatio,
        changeSummary: 'Created a reviewable smart speech-cleanup proposal in Workbench.'
      }))
      const proposalId = findProposalId(payload)
      if (!proposalId) throw new Error('Cut speech-cleanup proposal response is invalid.')
      await onProposalCreated(proposalId)
      notify('success', t('cleanupProposalCreated'))
    } catch (error) {
      notify('error', errorText(error))
    } finally {
      setCreating(false)
    }
  }

  return <section className="smart-speech-cleanup speech-cleanup-panel" data-testid="cut-smart-speech-cleanup">
    <div className="speech-cleanup-commandbar">
      <div className="speech-cleanup-search"><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cleanupSearch')} aria-label={t('cleanupSearch')} /></div>
      <Button variant="outline" size="sm" disabled={proposalDisabled || creating || !transcriptId} onClick={() => void createProposal()}><Sparkles />{creating ? t('cleanupCreating') : t('cleanupAutoRemove')}</Button>
    </div>
    <div className="speech-cleanup-sourcebar">
      <Select value={transcriptId} onValueChange={setTranscriptId} disabled={creating}>
        <SelectTrigger aria-label={t('cleanupTranscript')}><SelectValue placeholder={t('cleanupTranscript')} /></SelectTrigger>
        <SelectContent>{transcripts.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <Badge variant="outline">{scopeLabel}</Badge>
    </div>
    <details className="speech-cleanup-settings">
      <summary><Settings2 />{t('cleanupRecognitionSettings')}<span>{t(mode === 'conservative' ? 'cleanupModeConservative' : mode === 'aggressive' ? 'cleanupModeAggressive' : 'cleanupModeBalanced')}</span></summary>
      <div className="speech-cleanup-settings-content">
        <label className="smart-cleanup-field"><span>{t('cleanupMode')}</span><Select value={mode} onValueChange={selectMode} disabled={creating}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="conservative">{t('cleanupModeConservative')}</SelectItem><SelectItem value="balanced">{t('cleanupModeBalanced')}</SelectItem><SelectItem value="aggressive">{t('cleanupModeAggressive')}</SelectItem></SelectContent></Select></label>
        <div className="smart-cleanup-toggles">
          <CleanupToggle label={t('cleanupPauses')} value={settings.removeSilence} onValue={(value) => setSettings((current) => ({ ...current, removeSilence: value }))} />
          <CleanupToggle label={t('cleanupFillers')} value={settings.removeFillers} onValue={(value) => setSettings((current) => ({ ...current, removeFillers: value }))} />
          <CleanupToggle label={t('cleanupRepetitions')} value={settings.removeRepeatedPhrases} onValue={(value) => setSettings((current) => ({ ...current, removeRepeatedPhrases: value }))} />
          <CleanupToggle label={t('cleanupStutters')} value={settings.removeStutters} onValue={(value) => setSettings((current) => ({ ...current, removeStutters: value }))} />
        </div>
        <div className="smart-cleanup-sliders">
          <label><span>{t('cleanupMinimumPause')} <b>{settings.minimumSilenceSeconds.toFixed(2)}s</b></span><Slider min={0.3} max={2} step={0.05} value={[settings.minimumSilenceSeconds]} onValueChange={(value) => setSettings((current) => ({ ...current, minimumSilenceSeconds: value[0] ?? current.minimumSilenceSeconds }))} /></label>
          <label><span>{t('cleanupRemovalLimit')} <b>{Math.round(settings.maxRemovalRatio * 100)}%</b></span><Slider min={5} max={60} step={5} value={[settings.maxRemovalRatio * 100]} onValueChange={(value) => setSettings((current) => ({ ...current, maxRemovalRatio: (value[0] ?? current.maxRemovalRatio * 100) / 100 }))} /></label>
        </div>
      </div>
    </details>
    <div className="speech-cleanup-hint"><FileText /><span>{t('cleanupSelectionHint')}</span></div>
    {!transcripts.length ? <div className="empty-card">{t('cleanupNoTranscript')}</div>
      : loadingTranscript ? <div className="empty-card">{t('cleanupLoadingTranscript')}</div>
        : <div ref={transcriptShellRef} className="speech-cleanup-transcript-shell">
          <div ref={transcriptTextRef} className="speech-cleanup-transcript-text" onPointerUp={() => window.setTimeout(captureSelection, 0)} onKeyUp={captureSelection}>
            {filteredSegments.map((segment, index) => {
              const tokens = transcriptTokens(segment).filter((token) => !relevantDeletions.some((item) => rangesOverlap(token.start, token.end, item.sourceStart, item.sourceEnd)))
              const previous = filteredSegments[index - 1]
              const gap = previous ? segment.start - previous.end : 0
              return <React.Fragment key={segment.id}>
                {gap >= 0.3 && <span className="speech-cleanup-gap">[…{gap.toFixed(1)}s]</span>}
                <p data-segment-id={segment.id}>{tokens.map((token) => <span key={token.id} data-speech-token data-start={token.start} data-end={token.end}>{token.text}</span>)}</p>
              </React.Fragment>
            })}
          </div>
          {selectionToolbar && <div className="speech-selection-actions" style={{ left: selectionToolbar.left, top: selectionToolbar.top }}>
            <Button size="xs" variant="destructive" disabled={disabled} onClick={deleteSelection}><Trash2 />{t('cleanupDeleteSelection')}</Button>
            <Button size="xs" variant="ghost" disabled title={t('cleanupAiCorrectionReserved')}><WandSparkles />{t('cleanupAiCorrection')}</Button>
          </div>}
        </div>}
  </section>
}

function CleanupToggle({ label, value, onValue }: { label: string; value: boolean; onValue: (value: boolean) => void }) {
  return <label><span>{label}</span><Switch checked={value} onCheckedChange={onValue} /></label>
}

function parseTranscriptPage(value: RemoteValue | null): TranscriptPage | null {
  const unwrapped = unwrap(value)
  if (!isRemoteObject(unwrapped) || !Array.isArray(unwrapped.items)) return null
  const items = unwrapped.items.flatMap((item) => {
    if (!isRemoteObject(item) || typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.start !== 'number' || typeof item.end !== 'number') return []
    const words = Array.isArray(item.words) ? item.words.flatMap((word) => {
      if (!isRemoteObject(word) || typeof word.text !== 'string' || typeof word.start !== 'number' || typeof word.end !== 'number') return []
      return [{ text: word.text, start: word.start, end: word.end }]
    }) : null
    return [{ id: item.id, text: item.text, start: item.start, end: item.end, words }]
  })
  return { items, total: typeof unwrapped.total === 'number' ? unwrapped.total : items.length }
}

function transcriptTokens(segment: TranscriptSegment): TranscriptToken[] {
  if (segment.words?.length) return segment.words.flatMap((word, index) => [
    { id: `${segment.id}-word-${index}`, start: word.start, end: word.end, text: word.text },
    ...(index < segment.words!.length - 1 && needsWordSpace(word.text, segment.words![index + 1]!.text)
      ? [{ id: `${segment.id}-space-${index}`, start: word.end, end: Math.max(word.end + 0.0001, segment.words![index + 1]!.start), text: ' ' }]
      : [])
  ])
  const chunks = segment.text.match(/\s+|[\p{Script=Han}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\s]/gu) ?? [segment.text]
  const weights = chunks.map((chunk) => Math.max(1, Array.from(chunk).length))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  let cursor = segment.start
  return chunks.map((text, index) => {
    const end = index === chunks.length - 1 ? segment.end : cursor + (segment.end - segment.start) * weights[index]! / totalWeight
    const token = { id: `${segment.id}-token-${index}`, start: cursor, end, text }
    cursor = end
    return token
  })
}

function needsWordSpace(left: string, right: string) {
  return /[\p{L}\p{N}]$/u.test(left) && /^[\p{L}\p{N}]/u.test(right)
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd - 0.0001 && rightStart < leftEnd - 0.0001
}

function clearSelection(
  setToolbar: React.Dispatch<React.SetStateAction<SelectionToolbar | null>>,
  onSelectionChange: (selection: SpeechCleanupTextSelection | null) => void
) {
  window.getSelection()?.removeAllRanges()
  setToolbar(null)
  onSelectionChange(null)
}

function findProposalId(value: RemoteValue | null): string | null {
  const unwrapped = unwrap(value)
  if (!isRemoteObject(unwrapped)) return null
  if (isRemoteObject(unwrapped.proposal) && typeof unwrapped.proposal.id === 'string') return unwrapped.proposal.id
  return null
}

function unwrap(value: RemoteValue | null): RemoteValue | null {
  let current = value
  for (let index = 0; index < 4 && isRemoteObject(current); index += 1) {
    const next = current.data ?? current.payload ?? current.result
    if (next === undefined) break
    current = next
  }
  return current
}
