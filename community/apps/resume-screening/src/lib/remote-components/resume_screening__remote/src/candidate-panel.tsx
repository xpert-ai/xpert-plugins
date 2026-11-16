import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, Tabs, TabsList, TabsTrigger, TabsContent, Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, WorkbenchActionError, notify } from './bridge'
import { RESUME_REVISION_CONFLICT } from '../../../action-contract.js'
import type { CandidateDetail, CandidateFields, ResumeDegreeLevel } from '../../../types.js'
import { i18n, useLocalizedMessage, type ResumeCatalog } from './i18n'
import { parseSkillInput } from './skill-input'
import { SkillTagsInput } from './skill-tags-input'
import { React } from './vendor'
import { LoadingState } from './loading-state'

const DEGREES: Array<{ value: ResumeDegreeLevel; label: keyof ResumeCatalog }> = [
  { value: 'high_school', label: 'degreeHighSchool' }, { value: 'associate', label: 'degreeAssociate' },
  { value: 'bachelor', label: 'degreeBachelor' }, { value: 'master', label: 'degreeMaster' }, { value: 'doctorate', label: 'degreeDoctorate' }
]

export function CandidateFieldsEditor({ value, onChange, disabled }: {
  value: CandidateFields; onChange: (value: CandidateFields) => void; disabled: boolean
}) {
  const patch = (next: Partial<CandidateFields>) => onChange({ ...value, ...next })
  return <div className="grid gap-5">
    <section className="grid gap-4">
      <h3 className="font-medium">{i18n.t('candidateBasics')}</h3>
      <div className="grid gap-2"><Label htmlFor="candidate-name">{i18n.t('addNameLabel')}</Label>
        <Input id="candidate-name" maxLength={200} disabled={disabled} value={value.name} onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2"><Label htmlFor="candidate-years">{i18n.t('addYearsLabel')}</Label>
          <Input id="candidate-years" type="number" min={0} max={60} step={1} disabled={disabled}
            value={Number.isNaN(value.yearsOfExperience) ? '' : value.yearsOfExperience}
            onChange={(e) => patch({ yearsOfExperience: e.target.value === '' ? NaN : Number(e.target.value) })} /></div>
        <div className="grid gap-2"><Label htmlFor="candidate-degree">{i18n.t('addDegreeLabel')}</Label>
          <Select disabled={disabled} value={value.degree} onValueChange={(degree) => patch({ degree: degree as ResumeDegreeLevel })}>
            <SelectTrigger id="candidate-degree"><SelectValue /></SelectTrigger>
            <SelectContent>{DEGREES.map((degree) => <SelectItem key={degree.value} value={degree.value}>{i18n.t(degree.label)}</SelectItem>)}</SelectContent>
          </Select></div>
      </div>
      <div className="grid gap-2"><Label htmlFor="candidate-skills">{i18n.t('addSkillsLabel')}</Label>
        <SkillTagsInput id="candidate-skills" value={value.skills.join(', ')} onChange={(skills) => patch({ skills: parseSkillInput(skills) })} disabled={disabled} />
      </div>
    </section>
    <section className="grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="candidate-body">{i18n.t('addResumeLabel')}</Label>
        <Button variant="ghost" size="sm" disabled={disabled || Boolean(value.resumeText.trim())}
          onClick={() => patch({ resumeText: i18n.t('resumeOutline') })}>{i18n.t('insertOutline')}</Button></div>
      <p className="text-muted-foreground">{i18n.t('resumeEvidenceHint')}</p>
      <Textarea id="candidate-body" disabled={disabled} value={value.resumeText} rows={12} maxLength={20000}
        placeholder={i18n.t('resumePlaceholder')} aria-describedby="candidate-body-hint"
        onChange={(e) => patch({ resumeText: e.target.value })} />
      <p id="candidate-body-hint" className="text-xs text-muted-foreground">{i18n.t('resumeLength', { length: value.resumeText.length })}</p>
      <dl className="grid gap-2 text-xs text-muted-foreground">
        {(['experience', 'skills', 'project_relevance', 'stability', 'bonus'] as const).map((key) => <div key={key} className="grid grid-cols-[6rem_1fr] gap-2">
          <dt>{i18n.t(key)}</dt><dd>{i18n.t(`evidenceHint_${key}`)}</dd>
        </div>)}
      </dl>
    </section>
  </div>
}

const EMPTY: CandidateFields = { name: '', yearsOfExperience: 0, degree: 'bachelor', skills: [], resumeText: '' }

export function CandidatePanel({ screeningId, candidateId, open, onClose, onSaved, onScore }: {
  screeningId: string | null; candidateId: string | null; open: boolean; onClose: () => void
  onSaved: () => void; onScore: (candidateId: string) => void
}) {
  const [detail, setDetail] = React.useState<CandidateDetail | null>(null)
  const [draft, setDraft] = React.useState<CandidateFields>(EMPTY)
  const [editing, setEditing] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = useLocalizedMessage(i18n, '')
  const requestId = React.useRef(crypto.randomUUID())
  const loadSequence = React.useRef(0)
  const load = React.useCallback(async () => {
    if (!screeningId || !candidateId) return
    const sequence = ++loadSequence.current
    setLoading(true); setError('')
    try {
      const result = await executeAction('get_candidate', candidateId, { screeningId, candidateId })
      if (!result.data?.candidate) throw new Error('Missing candidate detail')
      if (sequence !== loadSequence.current) return
      setDetail(result.data.candidate); setDraft(result.data.candidate)
    } catch { if (sequence === loadSequence.current) setError(i18n.message('candidateLoadFailed')) }
    finally { if (sequence === loadSequence.current) setLoading(false) }
  }, [screeningId, candidateId, setError])
  React.useEffect(() => {
    if (!open) return
    ++loadSequence.current
    setDetail(null); setDraft(EMPTY); setEditing(candidateId === null); setError('')
    if (candidateId) void load()
    else requestId.current = crypto.randomUUID()
  }, [open, candidateId, load, setError])
  const save = async () => {
    if (!screeningId || saving) return
    setSaving(true); setError('')
    try {
      const result = await executeAction(candidateId ? 'update_candidate' : 'add_candidate', candidateId ?? '', {
        ...draft, screeningId, ...(candidateId ? { candidateId, baseRevision: detail?.revision } : { requestId: requestId.current })
      })
      notify(i18n.t(candidateId ? 'candidateSaved' : 'addSaved'))
      onSaved()
      if (candidateId && result.data?.candidate) { setDetail(result.data.candidate); setDraft(result.data.candidate); setEditing(false) }
      else onClose()
    } catch (reason) {
      setError(i18n.message(reason instanceof WorkbenchActionError && reason.code === RESUME_REVISION_CONFLICT
        ? 'candidateConflict' : 'candidateSaveFailed'))
    } finally { setSaving(false) }
  }
  const valid = draft.name.trim() && draft.resumeText.trim().length >= 30 && draft.resumeText.length <= 20000
    && Number.isInteger(draft.yearsOfExperience) && draft.yearsOfExperience >= 0 && draft.yearsOfExperience <= 60
    && draft.skills.length > 0 && draft.skills.length <= 50
  return <Sheet open={open} onOpenChange={(next) => !next && !saving && onClose()}>
    <SheetContent showCloseButton={false} className="overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
      <SheetHeader className="shrink-0 pr-16"><SheetTitle>{candidateId ? detail?.name ?? i18n.t('viewResume') : i18n.t('addTitle')}</SheetTitle>
        <SheetDescription>{i18n.t(editing ? 'candidateEditHint' : 'candidateViewHint')}</SheetDescription>
        <Button variant="ghost" size="sm" disabled={saving} className="absolute right-3 top-3" onClick={onClose}>{i18n.t('closeDetails')}</Button>
      </SheetHeader>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
        {loading ? <LoadingState /> : editing ? <>
          {candidateId ? <p className="text-muted-foreground">{i18n.t('candidateChangeWarning')}</p> : null}
          <CandidateFieldsEditor value={draft} onChange={setDraft} disabled={saving} />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={saving} onClick={() => { if (detail) { setDraft(detail); setEditing(false); setError('') } else onClose() }}>{i18n.t('createCancel')}</Button>
            <Button disabled={saving || !valid} onClick={() => void save()}>{i18n.t(saving ? 'editSaving' : candidateId ? 'candidateSave' : 'addSubmit')}</Button>
          </div>
        </> : detail ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
            <Badge variant={detail.scoreState === 'stale' ? 'destructive' : 'secondary'}>{i18n.t(`state_${detail.scoreState}`)}</Badge>
            <span className="text-muted-foreground">{i18n.t('resumeVersion', { version: detail.revision })}</span>
            </div><div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>{i18n.t('editResume')}</Button>
            <Button onClick={() => onScore(detail.candidateId)}>{i18n.t(detail.scoreState === 'unscored' ? 'scoreOne' : 'rescoreOne')}</Button>
            </div>
          </div>
          {detail.scoreState === 'stale' || detail.scoreState === 'unverified' ? <p className="text-muted-foreground">{i18n.t(detail.scoreState === 'stale' ? 'staleEvidenceHint' : 'unverifiedEvidenceHint')}</p> : null}
          <Tabs defaultValue="resume">
            <TabsList><TabsTrigger value="resume">{i18n.t('resumeTab')}</TabsTrigger><TabsTrigger value="evidence">{i18n.t('evidenceTab')}</TabsTrigger><TabsTrigger value="history">{i18n.t('historyTab')}</TabsTrigger></TabsList>
            <TabsContent value="resume"><div className="grid gap-4 py-4">
              <p>{i18n.t('candidateMeta', { years: detail.yearsOfExperience, degree: i18n.t(DEGREES.find((item) => item.value === detail.degree)?.label ?? 'degreeBachelor') })}</p>
              <div className="flex flex-wrap gap-1">{detail.skills.map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}</div>
              <h3 className="font-medium">{i18n.t('addResumeLabel')}</h3><p className="whitespace-pre-wrap break-words leading-relaxed">{detail.resumeText}</p>
            </div></TabsContent>
            <TabsContent value="evidence"><div className="grid gap-3 py-4">
              <p className="text-muted-foreground">{i18n.t('snapshotHint')}</p>
              {detail.evidence ? <><p>{i18n.t('resumeVersion', { version: detail.evidence.candidateRevision })}</p>
                <h3 className="font-medium">{i18n.t('createJdLabel')}</h3><p className="whitespace-pre-wrap break-words">{detail.evidence.jdText}</p>
                <h3 className="font-medium">{i18n.t('addResumeLabel')}</h3><p className="whitespace-pre-wrap break-words leading-relaxed">{detail.evidence.resumeText}</p>
              </> : <p>{i18n.t('unverifiedEvidenceHint')}</p>}
            </div></TabsContent>
            <TabsContent value="history"><div className="grid gap-5 py-4">
              <p className="text-muted-foreground">{i18n.t('historyHint')}</p>
              {detail.history.length ? [...detail.history].reverse().map((history) => <section key={history.revision} className="grid gap-2 border-b pb-4">
                <h3 className="font-medium">{i18n.t('historyRevision', { revision: history.revision, score: history.adjustedTotal ?? history.totalScore })}</h3>
                <p className="text-muted-foreground">{i18n.t('historyScoredAt', {
                  time: history.scoredAt ? i18n.date(history.scoredAt, { dateStyle: 'medium', timeStyle: 'medium' }) || i18n.t('scoreTimeUnknown') : i18n.t('scoreTimeUnknown')
                })}</p>
                <p>{i18n.t(history.adjustedTotal != null ? 'scoreAdjustedSummary' : 'scoreOriginalSummary', {
                  ai: history.totalScore, score: history.adjustedTotal ?? history.totalScore
                })}</p><p>{history.note}</p>
                <p>{i18n.t('humanDecision')}: {history.decision ? i18n.t(history.decision === 'interview' ? 'decisionInterview'
                  : history.decision === 'pending' ? 'decisionPending' : 'decisionRejected') : i18n.t('notConfirmed')}</p>
                {history.dimensions.map((item) => <p key={item.dimension}><span>{i18n.t(item.dimension)} {item.score}/20</span> · {item.reason}</p>)}
                {history.evidence ? <p className="whitespace-pre-wrap text-muted-foreground">{history.evidence.resumeText}</p> : <p>{i18n.t('unverifiedEvidenceHint')}</p>}
              </section>) : <p className="text-muted-foreground">{i18n.t('historyEmpty')}</p>}
            </div></TabsContent>
          </Tabs>
        </> : null}
        {error ? <p role="alert" className="text-destructive">{error}{!editing ? <Button variant="link" onClick={() => void load()}>{i18n.t('retry')}</Button> : null}</p> : null}
      </div>
    </SheetContent>
  </Sheet>
}
