import * as React from 'react'
import {
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Textarea,
} from '@xpert-ai/plugin-shadcn-ui'
import {
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  FileText,
  CheckCircle2,
} from 'lucide-react'
import type { GovernanceCase, Candidate, ActionInput } from '../../../contracts'
import { useI18n } from './i18n'
import { Status } from './ui'
function CandidateComparison({ candidate }: { candidate: Candidate }) {
  const { t } = useI18n()
  return (
    <section className="candidate-section">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">
            {candidate.code} · {candidate.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {candidate.rationale}
          </p>
        </div>
        <Badge variant="outline">{t(candidate.relation)}</Badge>
      </div>
      <div
        className={`candidate-rule ${candidate.hardFilterPassed ? 'rule-pass' : 'rule-fail'}`}
      >
        {candidate.hardFilterPassed ? (
          <ShieldCheck size={16} />
        ) : (
          <ShieldAlert size={16} />
        )}
        <strong>
          {t(candidate.hardFilterPassed ? 'hardPass' : 'hardFail')}
        </strong>
        <span>
          {t('consistency')} {Math.round(candidate.score * 100)}%
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('attribute')}</TableHead>
            <TableHead>{t('current')}</TableHead>
            <TableHead>{t('candidate')}</TableHead>
            <TableHead>{t('result')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidate.differences.map((d) => (
            <TableRow key={d.key}>
              <TableCell>
                {d.label}
                {d.critical && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('critical')}
                  </span>
                )}
              </TableCell>
              <TableCell>{d.source || '—'}</TableCell>
              <TableCell>{d.candidate || '—'}</TableCell>
              <TableCell>
                <span className={`comparison-${d.result}`}>{t(d.result)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
export function Workspace({
  current,
  canApprove,
  busy,
  onAction,
}: {
  current: GovernanceCase
  canApprove: boolean
  busy: boolean
  onAction: (key: string, input: Partial<ActionInput>) => Promise<void>
}) {
  const { t, currency, date } = useI18n()
  const [tab, setTab] = React.useState('materials')
  const [confirm, setConfirm] = React.useState<'approved' | 'rejected' | null>(
    null,
  )
  const [reason, setReason] = React.useState('')
  const proposal = current.proposal
  const submit = async () => {
    if (!confirm) return
    await onAction('decide_proposal', { decision: confirm, reason })
    setConfirm(null)
  }
  return (
    <div className="workspace-layout">
      <div className="workspace-main">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {(
              [
                'materials',
                'candidates',
                'evidence',
                'impacts',
                'audit',
              ] as const
            ).map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(k)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="materials">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('source')}</TableHead>
                  <TableHead>{t('code')}</TableHead>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('drawing')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.materials.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.system}
                      <p className="text-xs text-muted-foreground">{m.plant}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.code}
                    </TableCell>
                    <TableCell>
                      {m.name}
                      <p className="text-xs text-muted-foreground">
                        {m.attributes
                          .map((a) => `${a.label} ${a.value}${a.unit ?? ''}`)
                          .join(' · ')}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.drawing} / {m.revision}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="candidates">
            {current.candidates.length ? (
              current.candidates.map((c) => (
                <CandidateComparison candidate={c} key={c.id} />
              ))
            ) : (
              <p className="empty-inline">{t('noArtifact')}</p>
            )}
          </TabsContent>
          <TabsContent value="evidence">
            <div className="drawing-gallery">
              {current.drawings?.map((d) => (
                <figure key={d.id}>
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.content)}`}
                    alt={d.title}
                  />
                  <figcaption>
                    {d.title} · SHA-256 {d.sha256.slice(0, 16)}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="evidence-list">
              {current.evidence.map((e) => (
                <article key={e.id}>
                  <FileText size={18} />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{e.system}</Badge>
                      <strong>
                        {e.field} · {e.value}
                      </strong>
                    </div>
                    <p>{e.excerpt}</p>
                    <small>
                      {e.reference}
                      {e.page ? ` / p.${e.page}` : ''} · {date(e.observedAt)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="impacts">
            {current.impacts.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('source')}</TableHead>
                    <TableHead>{t('subject')}</TableHead>
                    <TableHead>{t('quantity')}</TableHead>
                    <TableHead>{t('amount')}</TableHead>
                    <TableHead>{t('action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.impacts.map((i) => (
                    <TableRow key={i.reference}>
                      <TableCell>
                        {i.system}
                        <p className="text-xs text-muted-foreground">
                          {i.reference}
                        </p>
                      </TableCell>
                      <TableCell>{i.description}</TableCell>
                      <TableCell>{i.quantity}</TableCell>
                      <TableCell>{currency(i.amount)}</TableCell>
                      <TableCell>{i.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="empty-inline">{t('noImpact')}</p>
            )}
          </TabsContent>
          <TabsContent value="audit">
            <ol className="audit-list">
              {current.artifacts.map((a) => (
                <li key={`${a.key}-${a.revision}`}>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>{t(a.roleKey)}</strong>
                    <p>{a.summary}</p>
                    <small>
                      {date(a.at)} · {t('revision')} {a.revision}
                    </small>
                  </div>
                </li>
              ))}
              {current.approval && (
                <li>
                  <ShieldCheck size={16} />
                  <div>
                    <strong>
                      {t('approvalRecord')} ·{' '}
                      <Status value={current.approval.decision} />
                    </strong>
                    <p>{current.approval.reason}</p>
                    <small>{date(current.approval.at)}</small>
                  </div>
                </li>
              )}
            </ol>
          </TabsContent>
        </Tabs>
      </div>
      <aside className="decision-panel">
        <div className="section-heading">
          <h2>{t('decision')}</h2>
          {proposal && (
            <Badge variant="outline">
              {t('revision')} {proposal.revision}
            </Badge>
          )}
        </div>
        {proposal ? (
          <>
            <span className="eyebrow">{t('recommendation')}</span>
            <h3>{t(proposal.operation)}</h3>
            <p>{proposal.summary}</p>
            <div className="mapping-list">
              <h4>{t('mappings')}</h4>
              {proposal.mappings.map((m) => (
                <div key={m.sourceId}>
                  <span>
                    {m.localCode}
                    <small>{m.plant}</small>
                  </span>
                  <ArrowRight size={14} />
                  <strong>{m.goldenId}</strong>
                </div>
              ))}
            </div>
            <h4>{t('safeguards')}</h4>
            <ul className="safeguards">
              {proposal.safeguards.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {current.status === 'review_required' && (
              <div className="approval-actions">
                <p>
                  <ShieldAlert size={15} />
                  {t('approvalNeeded')}
                </p>
                <Button
                  disabled={!canApprove || busy}
                  onClick={() => setConfirm('approved')}
                >
                  {t('approve')}
                </Button>
                <Button
                  variant="outline"
                  disabled={!canApprove || busy}
                  onClick={() => setConfirm('rejected')}
                >
                  {t('reject')}
                </Button>
              </div>
            )}
            <div className="publication-list">
              <h4>{t('publications')}</h4>
              {current.publications.length ? (
                current.publications.map((p) => (
                  <div key={p.operationId}>
                    <span>{p.system}</span>
                    <Badge variant="outline">
                      {t(p.status === 'confirmed' ? 'confirmed' : 'failed')}
                    </Badge>
                    <small>{p.externalReference ?? p.errorCode}</small>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('noPublication')}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="empty-inline">{t('noProposal')}</p>
        )}
      </aside>
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(confirm === 'rejected' ? 'reject' : 'approvalTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                confirm === 'rejected'
                  ? 'rejectionDescription'
                  : 'approvalDescription',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="text-sm" htmlFor="decision-reason">
            {t('reason')}
          </label>
          <Textarea
            id="decision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reasonPlaceholder')}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !reason.trim()}
              onClick={(e) => {
                e.preventDefault()
                void submit().catch(() => {})
              }}
            >
              {t(confirm === 'rejected' ? 'reject' : 'confirmApproval')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
