import * as React from 'react'
import {
  Button,
  Check,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  Upload
} from '@xpert-ai/plugin-shadcn-ui'
import { AssetDialog, DeleteEntityDialog } from './director-entity-dialogs'
import {
  addAsset,
  deleteAsset,
  updateAsset,
  type AssetDraft
} from './director-production-crud'
import type { Asset, Candidate, ProductionView } from './production-data'
import type { DirectorTranslator } from './director-types'
import { StudioPanelLayout } from './studio-panel-layout'
import {
  isContinuityCandidate,
  isExpressionCandidate,
  type AssetReferenceSet
} from './asset-reference-data'
import { compactVoiceReference } from '../../../voice-reference.js'

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
  onUploadAsset: (asset: Asset, file: File) => void
  onLockAsset: (assetId: string, candidateId: string) => void
}

export function DirectorAssetsPage(props: DirectorAssetsPageProps) {
  const { production, busy, t } = props
  const [category, setCategory] = React.useState<AssetCategory>('character')
  const [selectedAssetId, setSelectedAssetId] = React.useState(production.assets.find((item) => item.kind === 'character')?.id ?? production.assets[0]?.id ?? '')
  const [editing, setEditing] = React.useState<Asset | 'new' | null>(null)
  const [deleting, setDeleting] = React.useState<Asset | null>(null)
  const uploadRef = React.useRef<HTMLInputElement | null>(null)
  const matchingAssets = production.assets.filter((asset) => asset.kind === category)
  const selectedAsset = matchingAssets.find((asset) => asset.id === selectedAssetId) ?? matchingAssets[0]
  const selectedCharacterVoiceReference = selectedAsset?.kind === 'character'
    ? compactVoiceReference(
      production.characters.find((character) => character.name === selectedAsset.name)
        ?.voiceReference
    )
    : null
  const editingCharacterVoiceReference =
    editing && editing !== 'new'
      ? compactVoiceReference(
          production.characters.find((character) => character.name === editing.name)
            ?.voiceReference
        )
      : null
  const imageCandidates = selectedAsset?.candidates.filter((candidate) => candidate.kind === 'image') ?? []
  const continuityCandidates = imageCandidates.filter(isContinuityCandidate)
  const expressionCandidates = imageCandidates.filter(isExpressionCandidate)
  const selectedCandidate = continuityCandidates.find((candidate) => candidate.selected) ?? continuityCandidates[0]

  React.useEffect(() => {
    if (!selectedAsset || selectedAsset.kind !== category) setSelectedAssetId(matchingAssets[0]?.id ?? '')
  }, [category, matchingAssets, selectedAsset])

  async function submitAsset(draft: AssetDraft) {
    const next = structuredClone(production)
    let id = editing !== 'new' && editing ? editing.id : `asset-${crypto.randomUUID()}`
    if (editing !== 'new' && editing) updateAsset(next, editing.id, draft)
    else addAsset(next, id, `character-${crypto.randomUUID()}`, draft)
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

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && selectedAsset) props.onUploadAsset(selectedAsset, file)
    event.target.value = ''
  }

  return (
    <StudioPanelLayout storageKey="assets" leftLabel={t('director.assets.library')} rightLabel={t('director.assets.identity')} className="bg-studio-canvas text-studio-ink" testId="director-assets-page">
      <aside className="row-start-1 flex min-h-0 flex-col border-r border-studio-line bg-studio-paper/80">
        <header className="flex items-center justify-between border-b border-studio-line px-4 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted">{t('director.assets.library')}</p><strong className="font-display text-xl">{production.assets.length}</strong></div>
          <button type="button" className="grid size-9 place-items-center rounded-md bg-studio-brass text-white shadow-sm" aria-label={t('director.crud.newAsset')} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /></button>
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
              <Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()} disabled={busy}><Upload aria-hidden="true" />{t('director.assets.upload')}</Button>
              <Button variant="outline" size="sm" className="text-studio-danger" onClick={() => setDeleting(selectedAsset)}><Trash2 aria-hidden="true" />{t('actions.delete')}</Button>
            </header>
            <div className="grid gap-5 p-5">
              <section className="director-assets-visual-grid">
                <figure className="overflow-hidden rounded-xl border border-studio-line bg-studio-paper shadow-sm"><AssetImage className="aspect-[4/3] h-full w-full" asset={selectedAsset} candidate={selectedCandidate} t={t} showLabel /></figure>
                <div className="rounded-xl border border-studio-line bg-studio-paper p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-display text-lg font-bold">{assetViewsTitle(selectedAsset, t)}</h3><span className="shrink-0 text-xs text-studio-muted">{t('director.assets.viewCount', { count: continuityCandidates.filter((candidate) => Boolean(candidateImageUrl(candidate))).length })}</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    {continuityCandidates.length ? continuityCandidates.slice(0, 4).map((candidate, index) => (
                      <ReferenceImageCard key={candidate.id} asset={selectedAsset} candidate={candidate} fallbackIndex={index} selected={candidate.id === selectedCandidate?.id} t={t} onSelect={() => props.onLockAsset(selectedAsset.id, candidate.id)} />
                    )) : <figure className="col-span-2 overflow-hidden rounded-lg border border-dashed border-studio-line"><AssetImage className="aspect-video w-full" asset={selectedAsset} t={t} showLabel /></figure>}
                  </div>
                </div>
              </section>
              {selectedAsset.kind === 'character' ? <Panel title={t('director.assets.expressions')} meta={t('director.assets.expressionCount', { count: expressionCandidates.filter((candidate) => Boolean(candidateImageUrl(candidate))).length })}>
                {expressionCandidates.length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">{expressionCandidates.slice(0, 4).map((candidate) => <ReferenceImageCard key={candidate.id} asset={selectedAsset} candidate={candidate} selected={false} t={t} />)}</div> : <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-studio-line bg-studio-canvas p-6 text-center"><span className="grid max-w-xs place-items-center gap-2 text-studio-muted"><ImageIcon className="size-7" aria-hidden="true" /><strong className="text-sm text-studio-ink">{t('director.assets.noExpressions')}</strong><small className="text-xs leading-5">{t('director.assets.noExpressionsHelp')}</small></span></div>}
              </Panel> : null}
              <Panel title={t('director.crud.continuity')}><p className="text-sm leading-7 text-studio-muted">{selectedAsset.continuityNotes || selectedAsset.categoryDetails.continuity || '—'}</p></Panel>
            </div>
          </>
        ) : null}
      </section>

      <aside className="row-start-1 min-h-0 overflow-y-auto border-l border-studio-line bg-studio-paper/90 p-4">
        {selectedAsset ? <div className="grid gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted">{t('director.assets.identity')}</p><h3 className="mt-1 font-display text-xl font-bold">{selectedAsset.name}</h3></div>
          <DetailRows asset={selectedAsset} t={t} />
          <InspectorBlock label={t('editor.prompt')} value={selectedAsset.prompt} mono />
          <InspectorBlock label={t('director.crud.negativePrompt')} value={selectedAsset.negativePrompt || '—'} />
          <Button variant="outline" className="w-full" onClick={() => uploadRef.current?.click()} disabled={busy}><Upload aria-hidden="true" />{t('director.assets.upload')}</Button>
          <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />
          <Button className="w-full" disabled={busy} onClick={() => props.onGenerateAsset(selectedAsset, 'continuity_views')}><RotateCcw aria-hidden="true" />{t(selectedAsset.kind === 'character' ? 'director.assets.generateCharacterViews' : 'director.assets.generateViews')}</Button>
          {selectedAsset.kind === 'character' ? <Button variant="outline" className="w-full" disabled={busy} onClick={() => props.onGenerateAsset(selectedAsset, 'expressions')}><ImageIcon aria-hidden="true" />{t('director.assets.generateExpressions')}</Button> : null}
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t('director.assets.lockHint')}</p>
        </div> : null}
      </aside>

      <footer className="col-span-3 row-start-2 flex items-center justify-between border-t border-studio-line bg-studio-paper px-5 text-xs text-studio-muted">
        <span>{t('director.assets.library')} {production.assets.length} · {t('director.assets.referencesCount', { count: production.assets.flatMap((asset) => asset.candidates).filter((candidate) => candidate.kind === 'image').length })}</span>
        <span>{t('director.assets.progress', { ready: production.assets.filter((asset) => asset.candidates.some((candidate) => candidate.kind === 'image' && candidate.selected && Boolean(candidateImageUrl(candidate)))).length, total: production.assets.length })}</span>
      </footer>

      <AssetDialog open={editing !== null} busy={busy} t={t} asset={editing === 'new' ? null : editing} initialKind={editing === 'new' ? category : editing?.kind ?? category} voiceReference={editingCharacterVoiceReference} onOpenChange={(open) => !open && setEditing(null)} onSubmit={(draft) => void submitAsset(draft)} />
      <DeleteEntityDialog open={Boolean(deleting)} busy={busy} t={t} title={t('director.crud.deleteAsset')} description={t('director.crud.deleteAssetHelp')} onOpenChange={(open) => !open && setDeleting(null)} onConfirm={() => void confirmDelete()} />
    </StudioPanelLayout>
  )
}

function Panel(props: { title: string; meta?: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-studio-line bg-studio-paper p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-display text-lg font-bold">{props.title}</h3>{props.meta ? <span className="shrink-0 text-xs text-studio-muted">{props.meta}</span> : null}</div>{props.children}</section>
}

function ReferenceImageCard(props: {
  asset: Asset
  candidate: Candidate
  fallbackIndex?: number
  selected: boolean
  t: DirectorTranslator
  onSelect?: () => void
}) {
  const label = assetReferenceLabel(props.candidate, props.t, props.fallbackIndex)
  const content = <><AssetImage className="aspect-video w-full" asset={props.asset} candidate={props.candidate} t={props.t} showLabel /><span className="flex min-h-8 items-center justify-between gap-2 border-t border-studio-line bg-studio-paper px-2 py-1.5 text-left text-[11px]"><strong className="truncate">{label}</strong>{props.selected ? <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-studio-brass"><Check className="size-3" aria-hidden="true" />{props.t('director.assets.primaryReference')}</span> : null}</span></>
  const className = `relative block w-full overflow-hidden rounded-lg border bg-studio-paper ${props.selected && candidateImageUrl(props.candidate) ? 'border-2 border-studio-brass' : 'border-studio-line'}`
  return props.onSelect ? <button type="button" className={`${className} transition hover:border-studio-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-brass/50`} aria-pressed={props.selected} aria-label={props.t('director.assets.setPrimaryReference', { label })} onClick={props.onSelect}>{content}</button> : <figure className={className}>{content}</figure>
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

function InspectorBlock(props: { label: string; value: string; mono?: boolean }) {
  return <section className="rounded-lg border border-studio-line bg-studio-canvas p-3"><h4 className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">{props.label}</h4><p className={`mt-2 text-xs leading-5 ${props.mono ? 'font-mono' : ''}`}>{props.value}</p></section>
}

function DetailRows(props: { asset: Asset; t: DirectorTranslator }) {
  const { asset, t } = props
  const fields = asset.kind === 'character'
    ? [[t('director.assets.identityDescription'), asset.categoryDetails.identity || asset.description], [t('director.assets.appearanceAnchors'), asset.categoryDetails.appearance], [t('director.assets.wardrobeField'), asset.categoryDetails.wardrobe], [t('director.assets.voice'), asset.categoryDetails.voice]]
    : asset.kind === 'location'
      ? [[t('director.crud.environment'), asset.categoryDetails.environment || asset.description], [t('director.crud.lighting'), asset.categoryDetails.lighting]]
      : asset.kind === 'prop'
        ? [[t('director.crud.material'), asset.categoryDetails.material], [t('director.crud.condition'), asset.categoryDetails.condition], [t('director.crud.storyFunction'), asset.categoryDetails.storyFunction || asset.description]]
        : [[t('director.crud.palette'), asset.categoryDetails.palette], [t('director.crud.lighting'), asset.categoryDetails.lighting], [t('director.crud.lens'), asset.categoryDetails.lens]]
  return <dl className="divide-y divide-studio-line rounded-lg border border-studio-line bg-studio-canvas">{fields.map(([label, value]) => <div key={label} className="grid gap-1 p-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">{label}</dt><dd className="text-sm leading-5">{value || '—'}</dd></div>)}</dl>
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
        className={`${props.className} object-cover`}
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
