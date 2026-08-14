import * as React from 'react'
import {
  Button,
  Check,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  Trash2,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Upload,
  WandSparkles
} from '@xpert-ai/plugin-shadcn-ui'
import { AssetDialog, DeleteEntityDialog } from './director-entity-dialogs'
import {
  addAsset,
  deleteAsset,
  isPrimaryAssetImageCandidateSelected,
  updateAsset,
  type AssetDraft
} from './director-production-crud'
import type {
  Asset,
  AssetReference,
  Candidate,
  ProductionView
} from './production-data'
import type {
  AssetImageUpload,
  AssetImageUploadOptions,
  DirectorTranslator
} from './director-types'
import { StudioPanelLayout } from './studio-panel-layout'
import {
  EXPRESSION_REFERENCES,
  continuityReferencesForAsset,
  isContinuityCandidate,
  isExpressionCandidate,
  type AssetReferenceSet
} from './asset-reference-data'
import {
  compactVoiceReference,
  type VoiceReferenceLike
} from '../../../voice-reference.js'

const h: typeof React.createElement = React.createElement
type AssetCategory = Asset['kind']

const CATEGORY_KEYS = {
  character: 'director.assets.characters',
  location: 'director.assets.locations',
  prop: 'director.assets.props',
  style: 'director.assets.styles'
} as const

type DirectorAssetsPageProps = {
  production: ProductionView
  busy: boolean
  t: DirectorTranslator
  onCommitProduction: (draft: ProductionView, changeSummary: string) => Promise<boolean>
  onGenerateAsset: (asset: Asset, referenceSet: AssetReferenceSet) => void
  onUploadAsset: (
    asset: Asset,
    file: File,
    options?: AssetImageUploadOptions
  ) => Promise<void>
  onUploadAssetBatch: (
    asset: Asset,
    uploads: AssetImageUpload[]
  ) => Promise<void>
  onUploadVoiceReference: (
    asset: Asset,
    file: File
  ) => Promise<VoiceReferenceLike | null>
  onLockAsset: (assetId: string, candidateId: string) => void
}

export function DirectorAssetsPage(props: DirectorAssetsPageProps) {
  const { production, busy, t } = props
  const [category, setCategory] = React.useState<AssetCategory>('character')
  const [selectedAssetId, setSelectedAssetId] = React.useState(production.assets.find((item) => item.kind === 'character')?.id ?? production.assets[0]?.id ?? '')
  const [editing, setEditing] = React.useState<Asset | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Asset | null>(null)
  const [deletingCandidate, setDeletingCandidate] = React.useState<Candidate | null>(null)
  const [previewCandidateId, setPreviewCandidateId] = React.useState<string | null>(null)
  const uploadRef = React.useRef<HTMLInputElement | null>(null)
  const batchUploadRef = React.useRef<HTMLInputElement | null>(null)
  const pendingUploadRef = React.useRef<AssetImageUploadOptions>({})
  const pendingBatchRef = React.useRef<AssetReferenceSet>('continuity_views')
  const matchingAssets = production.assets.filter((asset) => asset.kind === category)
  const selectedAsset = matchingAssets.find((asset) => asset.id === selectedAssetId) ?? matchingAssets[0]
  const selectedCharacterVoiceReference = React.useMemo(
    () => selectedAsset?.kind === 'character'
      ? compactVoiceReference(selectedAsset.voiceReference)
      : null,
    [selectedAsset]
  )
  const editingCharacterVoiceReference = React.useMemo(
    () => editing && editing !== 'new'
      ? compactVoiceReference(editing.voiceReference)
      : null,
    [editing]
  )
  const imageCandidates = selectedAsset?.candidates.filter((candidate) => candidate.kind === 'image') ?? []
  const continuityCandidates = imageCandidates.filter(isContinuityCandidate)
  const expressionCandidates = imageCandidates.filter(isExpressionCandidate)
  const primaryCandidate = continuityCandidates.find(
    (candidate) => candidate.selected && Boolean(candidateImageUrl(candidate))
  )
  const previewCandidate = imageCandidates.find(
    (candidate) => candidate.id === previewCandidateId && Boolean(candidateImageUrl(candidate))
  ) ?? primaryCandidate ?? continuityCandidates.find((candidate) => Boolean(candidateImageUrl(candidate)))
  const previewingPrimary = Boolean(
    previewCandidate && primaryCandidate?.id === previewCandidate.id
  )
  const continuityReferences = selectedAsset
    ? continuityReferencesForAsset(selectedAsset.kind)
    : []

  React.useEffect(() => {
    if (!selectedAsset || selectedAsset.kind !== category) setSelectedAssetId(matchingAssets[0]?.id ?? '')
  }, [category, matchingAssets, selectedAsset])

  React.useEffect(() => {
    setPreviewCandidateId(null)
  }, [selectedAsset?.id])

  async function submitAsset(draft: AssetDraft) {
    const next = structuredClone(production)
    let id = editing !== 'new' && editing ? editing.id : `asset-${crypto.randomUUID()}`
    if (editing !== 'new' && editing) updateAsset(next, editing.id, draft)
    else addAsset(next, id, draft)
    if (await props.onCommitProduction(next, t('changes.assetSaved', { title: draft.name }))) {
      setCategory(draft.kind)
      setSelectedAssetId(id)
      setEditing(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    const next = structuredClone(production)
    if (!deleteAsset(next, deleting.id)) return
    if (await props.onCommitProduction(next, t('changes.assetDeleted'))) {
      setDeleting(null)
      setSelectedAssetId(next.assets.find((item) => item.kind === category)?.id ?? '')
    }
  }

  function requestUpload(options: AssetImageUploadOptions = {}) {
    pendingUploadRef.current = options
    uploadRef.current?.click()
  }

  function requestBatchUpload(referenceSet: AssetReferenceSet) {
    pendingBatchRef.current = referenceSet
    batchUploadRef.current?.click()
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && selectedAsset) {
      void props.onUploadAsset(selectedAsset, file, pendingUploadRef.current)
    }
    event.target.value = ''
    pendingUploadRef.current = {}
  }

  function handleBatchFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4)
    if (files.length && selectedAsset) {
      const references = pendingBatchRef.current === 'expressions'
        ? EXPRESSION_REFERENCES
        : continuityReferences
      const uploads = files.flatMap((file, index) => {
        const assetReference = references[index]
        return assetReference
          ? [{
              file,
              assetReference,
              select:
                pendingBatchRef.current === 'continuity_views' &&
                !primaryCandidate &&
                index === 0,
              replaceReference: true
            }]
          : []
      })
      void props.onUploadAssetBatch(selectedAsset, uploads)
    }
    event.target.value = ''
  }

  async function confirmCandidateDelete() {
    if (!selectedAsset || !deletingCandidate) return
    const next = structuredClone(production)
    const asset = next.assets.find((item) => item.id === selectedAsset.id)
    if (!asset) return
    asset.candidates = asset.candidates.filter(
      (candidate) => candidate.id !== deletingCandidate.id
    )
    if (deletingCandidate.selected) {
      const fallback = asset.candidates.find(
        (candidate) => candidate.kind === 'image'
      )
      if (fallback) fallback.selected = true
    }
    if (await props.onCommitProduction(
      next,
      t('changes.assetReferenceDeleted', { asset: selectedAsset.name })
    )) setDeletingCandidate(null)
  }

  return (
    <TooltipProvider delayDuration={100}>
    <StudioPanelLayout storageKey="assets" leftLabel={t('director.assets.library')} className="bg-studio-canvas text-studio-ink" testId="director-assets-page">
      <aside className="row-start-1 flex min-h-0 flex-col border-r border-studio-line bg-studio-paper/80">
        <header className="flex items-center justify-between border-b border-studio-line px-4 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted">{t('director.assets.library')}</p><strong className="font-display text-xl">{production.assets.length}</strong></div>
          <IconTooltip label={t('director.crud.newAsset')}><button type="button" className="grid size-9 place-items-center rounded-md bg-studio-brass text-white shadow-sm" aria-label={t('director.crud.newAsset')} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /></button></IconTooltip>
        </header>
        <nav className="grid grid-cols-4 border-b border-studio-line" aria-label={t('director.assets.library')}>
          {(Object.keys(CATEGORY_KEYS) as AssetCategory[]).map((key) => (
            <button key={key} type="button" className={`border-b-2 px-1 py-3 text-[11px] font-semibold transition ${category === key ? 'border-studio-brass bg-amber-50 text-studio-brass' : 'border-transparent text-studio-muted hover:bg-studio-canvas'}`} onClick={() => setCategory(key)}>
              <span className="block truncate">{t(CATEGORY_KEYS[key])}</span><b className="mt-1 block text-sm">{production.assets.filter((asset) => asset.kind === key).length}</b>
            </button>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
          {matchingAssets.length ? <div className="grid min-w-0 max-w-full gap-2">{matchingAssets.map((asset) => {
            const assetContinuityCandidates = asset.candidates.filter(isContinuityCandidate)
            const candidate = assetContinuityCandidates.find((item) => item.selected) ?? assetContinuityCandidates[0]
            return (
              <button key={asset.id} type="button" className={`flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-lg border p-2 text-left transition ${selectedAsset?.id === asset.id ? 'border-studio-brass bg-amber-50 shadow-sm' : 'border-studio-line bg-studio-paper hover:border-studio-brass/60'}`} onClick={() => setSelectedAssetId(asset.id)}>
                <AssetImage className="size-14 shrink-0 rounded-md" asset={asset} candidate={candidate} t={t} />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{asset.name}</strong><small className="mt-1 block truncate text-[11px] text-studio-muted">{asset.description}</small></span>
                {candidate?.selected && candidateImageUrl(candidate) ? <Check className="size-4 text-emerald-600" aria-label={t('director.assets.locked')} /> : <span className="size-2 rounded-full bg-amber-400" />}
              </button>
            )
          })}</div> : (
            <button type="button" className="grid w-full place-items-center gap-2 rounded-xl border border-dashed border-studio-line bg-studio-canvas p-8 text-center text-sm text-studio-muted hover:border-studio-brass" onClick={() => setEditing('new')}><ImageIcon className="size-7" aria-hidden="true" />{t('director.crud.newAsset')}</button>
          )}
        </div>
        <div className="border-t border-studio-line p-3 text-xs text-studio-muted">{t('director.assets.usedShots', { count: production.counts.shots })}</div>
      </aside>

      <section className="director-assets-content row-start-1 min-w-0 overflow-y-auto">
        {selectedAsset ? (
          <>
            <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-studio-line bg-studio-canvas/95 px-5 backdrop-blur">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-display text-2xl font-bold">{selectedAsset.name}</h2>
                  <span className="rounded-full bg-studio-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{t(CATEGORY_KEYS[selectedAsset.kind])}</span>
                </div>
                <p className="truncate text-xs text-studio-muted">{selectedAsset.description}</p>
                {selectedCharacterVoiceReference ? (
                  <p className="mt-1 truncate text-[11px] text-studio-brass">
                    {t('asset.voiceReference')} · {selectedCharacterVoiceReference.label}
                  </p>
                ) : null}
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(selectedAsset)}><MoreHorizontal aria-hidden="true" />{t('actions.edit')}</Button>
              <Button variant="outline" size="sm" className="text-studio-danger" onClick={() => setDeleting(selectedAsset)}><Trash2 aria-hidden="true" />{t('actions.delete')}</Button>
            </header>
            <div className="grid gap-5 p-5">
              <section className="director-assets-visual-grid">
                <section className="overflow-hidden rounded-xl border border-studio-line bg-studio-paper shadow-sm">
                  <CardHeader
                    title={previewingPrimary ? t('director.assets.primaryReference') : t('director.assets.previewing')}
                    meta={previewCandidate ? assetReferenceLabel(previewCandidate, t) : t('director.assets.imageMissing')}
                    action={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => requestUpload({ assetReference: { type: 'general' }, select: true, replaceReference: true })}><Upload aria-hidden="true" />{primaryCandidate ? t('director.assets.replace') : t('director.assets.uploadPrimary')}</Button>}
                  />
                  <figure className="group relative overflow-hidden border-t border-studio-line"><AssetImage className="aspect-[4/3] h-full w-full" asset={selectedAsset} candidate={previewCandidate} t={t} showLabel />{previewCandidate && candidateImageUrl(previewCandidate) ? <figcaption className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg bg-studio-ink/85 px-3 py-2 text-xs text-white backdrop-blur"><span><b>{previewingPrimary ? t('director.assets.primaryReference') : t('director.assets.previewing')}</b> · {assetReferenceLabel(previewCandidate, t)}</span>{previewingPrimary ? <span className="flex items-center gap-1 text-amber-200"><Check className="size-3.5" aria-hidden="true" />{t('director.assets.locked')}</span> : <span className="text-white/75">{t('director.assets.previewing')}</span>}</figcaption> : null}</figure>
                </section>
                <div className="rounded-xl border border-studio-line bg-studio-paper p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-display text-lg font-bold">{assetViewsTitle(selectedAsset, t)}</h3><span className="text-xs text-studio-muted">{t('director.assets.viewCount', { count: continuityReferences.filter((reference) => Boolean(candidateForReference(imageCandidates, reference))).length })}</span></div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => requestBatchUpload('continuity_views')}><Upload aria-hidden="true" />{t('director.assets.batchUpload')}</Button><AiGenerateButton label={t(selectedAsset.kind === 'character' ? 'director.assets.generateCharacterViews' : 'director.assets.generateViews')} busy={busy} testId="generate-asset-views" onClick={() => props.onGenerateAsset(selectedAsset, 'continuity_views')} /></div></div>
                  <div className="grid grid-cols-2 gap-3">
                    {continuityReferences.map((reference, index) => {
                      const candidate = candidateForReference(imageCandidates, reference)
                      const selected = Boolean(candidate && candidate.id === primaryCandidate?.id)
                      const selectionApplied = Boolean(candidate && isPrimaryAssetImageCandidateSelected(selectedAsset, candidate.id))
                      return <ReferenceSlotCard key={`${reference.type}:${reference.key}`} asset={selectedAsset} reference={reference} candidate={candidate} fallbackIndex={index} selected={selected} previewed={Boolean(candidate && candidate.id === previewCandidate?.id)} busy={busy} t={t} onPreview={candidate ? () => setPreviewCandidateId(candidate.id) : undefined} onUpload={() => requestUpload({ assetReference: reference, select: !primaryCandidate, replaceReference: true })} onSetPrimary={candidate && !selectionApplied ? () => { setPreviewCandidateId(candidate.id); props.onLockAsset(selectedAsset.id, candidate.id) } : undefined} onDelete={candidate ? () => setDeletingCandidate(candidate) : undefined} />
                    })}
                  </div>
                </div>
              </section>
              {selectedAsset.kind === 'character' ? <Panel title={t('director.assets.expressions')} meta={t('director.assets.expressionCount', { count: EXPRESSION_REFERENCES.filter((reference) => Boolean(candidateForReference(imageCandidates, reference))).length })} action={<div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => requestBatchUpload('expressions')}><Upload aria-hidden="true" />{t('director.assets.batchUpload')}</Button><AiGenerateButton label={t('director.assets.generateExpressions')} busy={busy} testId="generate-asset-expressions" onClick={() => props.onGenerateAsset(selectedAsset, 'expressions')} /></div>}>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">{EXPRESSION_REFERENCES.map((reference) => { const candidate = candidateForReference(expressionCandidates, reference); return <ReferenceSlotCard key={`${reference.type}:${reference.key}`} asset={selectedAsset} reference={reference} candidate={candidate} selected={false} previewed={Boolean(candidate && candidate.id === previewCandidate?.id)} busy={busy} t={t} onPreview={candidate ? () => setPreviewCandidateId(candidate.id) : undefined} onUpload={() => requestUpload({ assetReference: reference, select: false, replaceReference: true })} onDelete={candidate ? () => setDeletingCandidate(candidate) : undefined} /> })}</div>
              </Panel> : null}
              <Panel title={t('director.crud.continuity')}><p className="text-sm leading-7 text-studio-muted">{selectedAsset.continuityNotes || selectedAsset.categoryDetails.continuity || '—'}</p></Panel>
            </div>
          </>
        ) : null}
      </section>

      <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />
      <input ref={batchUploadRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handleBatchFiles} />

      <footer className="col-span-2 row-start-2 flex items-center justify-between border-t border-studio-line bg-studio-paper px-5 text-xs text-studio-muted">
        <span>{t('director.assets.library')} {production.assets.length} · {t('director.assets.referencesCount', { count: production.assets.flatMap((asset) => asset.candidates).filter((candidate) => candidate.kind === 'image').length })}</span>
        <span>{t('director.assets.progress', { ready: production.assets.filter((asset) => asset.candidates.some((candidate) => candidate.kind === 'image' && candidate.selected && Boolean(candidateImageUrl(candidate)))).length, total: production.assets.length })}</span>
      </footer>

      <AssetDialog open={editing !== null} busy={busy} t={t} asset={editing === 'new' ? null : editing} initialKind={editing === 'new' ? category : editing?.kind ?? category} voiceReference={editingCharacterVoiceReference} onUploadVoiceReference={editing && editing !== 'new' ? (file) => props.onUploadVoiceReference(editing, file) : undefined} onOpenChange={(open) => !open && setEditing(null)} onSubmit={(draft) => void submitAsset(draft)} />
      <DeleteEntityDialog open={Boolean(deleting)} busy={busy} t={t} title={t('director.crud.deleteAsset')} description={t('director.crud.deleteAssetHelp')} onOpenChange={(open) => !open && setDeleting(null)} onConfirm={() => void confirmDelete()} />
      <DeleteEntityDialog open={Boolean(deletingCandidate)} busy={busy} t={t} title={t('director.assets.deleteReferenceTitle')} description={t('director.assets.deleteReferenceHelp')} onOpenChange={(open) => !open && setDeletingCandidate(null)} onConfirm={() => void confirmCandidateDelete()} />
    </StudioPanelLayout>
    </TooltipProvider>
  )
}

function Panel(props: { title: string; meta?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-studio-line bg-studio-paper p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-display text-lg font-bold">{props.title}</h3>{props.meta ? <span className="text-xs text-studio-muted">{props.meta}</span> : null}</div>{props.action}</div>{props.children}</section>
}

function CardHeader(props: { title: string; meta?: string; action?: React.ReactNode }) {
  return <header className="flex min-h-16 items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><h3 className="font-display text-lg font-bold">{props.title}</h3>{props.meta ? <p className="truncate text-xs text-studio-muted">{props.meta}</p> : null}</div>{props.action}</header>
}

function AiGenerateButton(props: { label: string; busy: boolean; testId: string; onClick: () => void }) {
  const tooltipId = `${props.testId}-tooltip`
  return <span className="group/ai-tooltip relative inline-flex"><Button type="button" size="icon" title={props.label} disabled={props.busy} aria-label={props.label} aria-describedby={tooltipId} data-testid={props.testId} onClick={props.onClick}><WandSparkles aria-hidden="true" /></Button><span id={tooltipId} role="tooltip" className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-max max-w-80 rounded-md bg-studio-ink px-3 py-2 text-xs leading-5 whitespace-normal text-white opacity-0 shadow-lg group-hover/ai-tooltip:visible group-hover/ai-tooltip:opacity-100 group-focus-within/ai-tooltip:visible group-focus-within/ai-tooltip:opacity-100">{props.label}</span></span>
}

function IconTooltip(props: { label: string; children: React.ReactElement; side?: 'top' | 'right' | 'bottom' | 'left'; align?: 'start' | 'center' | 'end' }) {
  return <Tooltip><TooltipTrigger asChild>{props.children}</TooltipTrigger><TooltipContent side={props.side ?? 'top'} align={props.align ?? 'center'} sideOffset={8} collisionPadding={12}>{props.label}</TooltipContent></Tooltip>
}

function ReferenceSlotCard(props: {
  asset: Asset
  reference: AssetReference
  candidate?: Candidate
  fallbackIndex?: number
  selected: boolean
  previewed: boolean
  busy: boolean
  t: DirectorTranslator
  onPreview?: () => void
  onSetPrimary?: () => void
  onUpload: () => void
  onDelete?: () => void
}) {
  const label = assetReferenceLabelFromReference(props.reference, props.t, props.fallbackIndex)
  const url = candidateImageUrl(props.candidate)
  return <article className={`group relative overflow-hidden rounded-lg border bg-studio-paper ${props.selected && url ? 'border-2 border-studio-brass' : props.previewed && url ? 'border-studio-ink ring-2 ring-studio-ink/15' : 'border-studio-line'}`}>
    {url ? <button type="button" className="block w-full text-left" aria-pressed={props.previewed} aria-label={props.t('director.assets.previewReference', { label })} onClick={props.onPreview}><AssetImage className="aspect-video w-full" asset={props.asset} candidate={props.candidate} t={props.t} /></button> : <button type="button" className="grid aspect-video w-full place-items-center gap-2 bg-studio-canvas p-4 text-center text-studio-muted transition hover:bg-amber-50 hover:text-studio-brass" onClick={props.onUpload}><Upload className="size-5" aria-hidden="true" /><span className="text-[11px] font-semibold">{props.t('director.assets.uploadSlot')}</span></button>}
    <div className="flex min-h-10 items-center justify-between gap-2 border-t border-studio-line bg-studio-paper px-2 py-1.5 text-left text-[11px]"><span className="min-w-0"><strong className="block truncate">{label}</strong>{props.selected ? <span className="flex items-center gap-1 text-[9px] font-bold text-studio-brass"><Check className="size-3" aria-hidden="true" />{props.t('director.assets.currentPrimary')}</span> : props.previewed ? <span className="block text-[9px] text-studio-muted">{props.t('director.assets.previewing')}</span> : null}</span><span className="flex shrink-0 items-center gap-1">{props.selected || props.onSetPrimary ? <IconTooltip label={props.selected ? props.t('director.assets.currentPrimary') : props.t('director.assets.setAsPrimary')}><Button type="button" variant={props.selected ? 'secondary' : 'outline'} size="sm" className="h-7 px-2 text-[10px]" disabled={props.selected || props.busy} onClick={props.onSetPrimary}><Check aria-hidden="true" />{props.selected ? props.t('director.assets.currentPrimary') : props.t('director.assets.setAsPrimary')}</Button></IconTooltip> : null}<IconTooltip label={url ? props.t('director.assets.replace') : props.t('director.assets.uploadSlot')}><button type="button" className="rounded p-1 text-studio-muted hover:bg-studio-canvas hover:text-studio-ink" aria-label={url ? props.t('director.assets.replace') : props.t('director.assets.uploadSlot')} onClick={props.onUpload}><Upload className="size-3.5" aria-hidden="true" /></button></IconTooltip>{props.onDelete ? <IconTooltip label={props.t('director.assets.deleteReferenceAction')}><button type="button" className="rounded p-1 text-studio-muted hover:bg-red-50 hover:text-studio-danger" aria-label={props.t('director.assets.deleteReferenceAction')} onClick={props.onDelete}><Trash2 className="size-3" /></button></IconTooltip> : null}</span></div>
  </article>
}

function assetViewsTitle(asset: Asset, t: DirectorTranslator) {
  if (asset.kind === 'character') return t('director.assets.characterViews')
  if (asset.kind === 'location') return t('director.assets.locationViews')
  if (asset.kind === 'prop') return t('director.assets.propViews')
  return t('director.assets.styleViews')
}

const REFERENCE_LABEL_KEYS = {
  front: 'director.assets.reference.front',
  three_quarter: 'director.assets.reference.threeQuarter',
  profile: 'director.assets.reference.profile',
  back: 'director.assets.reference.back',
  wide: 'director.assets.reference.wide',
  reverse: 'director.assets.reference.reverse',
  detail: 'director.assets.reference.detail',
  alternate: 'director.assets.reference.alternate',
  neutral: 'director.assets.reference.neutral',
  happy: 'director.assets.reference.happy',
  sad: 'director.assets.reference.sad',
  angry: 'director.assets.reference.angry'
} as const

function assetReferenceLabel(candidate: Candidate, t: DirectorTranslator, fallbackIndex?: number) {
  const reference = candidate.assetReference
  if (!reference) return fallbackIndex === undefined ? candidate.label : t('director.assets.referenceNumber', { number: fallbackIndex + 1 })
  if (reference.type === 'general') return candidate.label
  return t(REFERENCE_LABEL_KEYS[reference.key])
}

function assetReferenceLabelFromReference(
  reference: AssetReference,
  t: DirectorTranslator,
  fallbackIndex?: number
) {
  if (reference.type === 'general') {
    return fallbackIndex === undefined
      ? t('director.assets.primaryReference')
      : t('director.assets.referenceNumber', { number: fallbackIndex + 1 })
  }
  return t(REFERENCE_LABEL_KEYS[reference.key])
}

function candidateForReference(
  candidates: Candidate[],
  reference: AssetReference
) {
  return candidates.find((candidate) => sameAssetReference(candidate.assetReference, reference))
}

function sameAssetReference(
  left: AssetReference | null | undefined,
  right: AssetReference
) {
  if (!left) return false
  if (left.type === 'general' || right.type === 'general') {
    return left.type === 'general' && right.type === 'general'
  }
  if (left.type === 'continuity_view' && right.type === 'continuity_view') {
    return left.key === right.key
  }
  return left.type === 'expression' && right.type === 'expression' && left.key === right.key
}

function candidateImageUrl(candidate: Pick<Candidate, 'fileUrl'> | undefined) {
  const url = candidate?.fileUrl
  if (url && !(url.startsWith('data:image') && url.length < 500)) return url
  return null
}

function AssetImage(props: {
  asset: Asset
  candidate?: Pick<Candidate, 'fileUrl'>
  t: DirectorTranslator
  className: string
  showLabel?: boolean
}) {
  const url = candidateImageUrl(props.candidate)
  if (url) {
    return (
      <img
        className={`${props.className} bg-studio-canvas object-contain`}
        crossOrigin="use-credentials"
        src={url}
        alt={props.asset.name}
      />
    )
  }
  return (
    <div
      className={`${props.className} grid place-items-center overflow-hidden bg-studio-panel text-studio-muted`}
      role="img"
      aria-label={props.t('director.assets.imagePlaceholder', {
        name: props.asset.name
      })}
    >
      <span className="grid place-items-center gap-2 p-3 text-center">
        <ImageIcon className={props.showLabel ? 'size-7' : 'size-5'} aria-hidden="true" />
        {props.showLabel ? (
          <>
            <strong className="text-xs text-studio-ink">
              {props.t('director.assets.imageMissing')}
            </strong>
            <small className="text-[10px] leading-4">
              {props.t('director.assets.imageMissingHelp')}
            </small>
          </>
        ) : null}
      </span>
    </div>
  )
}
