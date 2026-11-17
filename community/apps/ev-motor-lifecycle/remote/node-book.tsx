import React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@xpert-ai/plugin-shadcn-ui'
import type { DeskKey, DeskState, NodeWorkbench } from '../src/node-workbench'
import type { WorkbenchData } from '../src/projection'
import type { Fact } from '../src/domain'
import { i18n, tr } from './i18n'

type Order = NonNullable<WorkbenchData['selected']>
type Page = NodeWorkbench['pages'][number]
const stageNames = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'] as const
const outcomeLabels = {
  approve: 'outApprove',
  reject: 'outReject',
  split: 'outSplit',
  expedite: 'outExpedite',
  original: 'outOriginal',
  shortage: 'routingShortage',
  stocked: 'routingStocked',
  matched: 'routingMatched',
  lookup: 'routingLookup',
} as const
function outcomeText(k?: string) {
  return k && Object.hasOwn(outcomeLabels, k) ? tr(outcomeLabels[k as keyof typeof outcomeLabels]) : k
}
function state(order: Order, page: Page): DeskState {
  const step = order.steps.find((s) => s.key === page.key)
  if (step?.event?.decision === 'reject') return 'rejected'
  if (page.nativeState) return page.nativeState
  return step?.state ?? page.controlState
}
function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="facts">
      {facts.map((f, i) => (
        <React.Fragment key={i}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
function Matrix({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((v, j) => (
              <TableCell key={j}>{v}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
function lookupEvidence(order: Order, key: DeskKey) {
  const event = (k: string) => order.steps.find((s) => s.key === k)?.event
  const inv = event('supply')?.routeRecord,
    a = event('asBuilt')?.routeRecord,
    r = event('benchReport')?.routeRecord
  const facts: Fact[] = []
  if ((key === 'supply' || key === 'materialRoute') && inv?.kind === 'inventory') {
    facts.push(
      { label: tr('qtyRequired'), value: String(inv.required) },
      { label: tr('qtyAvailable'), value: String(inv.available) },
      { label: tr('qtyGap'), value: String(Math.max(0, inv.required - inv.available)) },
    )
  }
  if (key === 'traceRoute') {
    if (a?.kind === 'assembly') facts.push({ label: tr('assemblySerial'), value: a.serial })
    if (r?.kind === 'report')
      facts.push(
        { label: tr('lookupSerial'), value: r.serial ?? tr('indexMiss') },
        { label: tr('referenceReport'), value: r.report ?? tr('indexMiss') },
      )
  }
  return facts
}
function ReceiptPages({
  page,
  order,
  native,
  initialReceipt,
  historical = false,
}: { historical?: boolean } & Pick<BookProps, 'order' | 'native' | 'initialReceipt'> & { page: Page }) {
  const gate = historical ? undefined : order.steps.find((s) => s.key === page.key)
  const choices = page.receipts
  const picked =
    choices.find((c) => c.key === initialReceipt) ??
    choices.find((c) => c.branch === gate?.event?.decision) ??
    choices[0]
  if (!picked) return null
  return (
    <section>
      <h3>{tr('parentGate')}</h3>
      <Tabs defaultValue={picked.key} key={page.key + picked.key}>
        <TabsList aria-label={tr('parentGate')}>
          {choices.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>
              {r.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {choices.map((r) => {
          const event = gate?.event?.decision === r.branch ? gate.event : undefined
          const actual =
            r.state ??
            (order.mode === 'rehearsal'
              ? event
                ? 'done'
                : gate?.event
                ? 'skipped'
                : 'queued'
              : 'unavailable')
          return (
            <TabsContent key={r.key} value={r.key}>
              <p>
                {order.mode === 'rehearsal' && tr('sampleDecision') + ' · '}
                {tr(actual)}
                {r.evidenceCount !== undefined && (
                  <>
                    {' '}
                    · {tr('receiptEvidence')} {r.evidenceCount}
                  </>
                )}
              </p>
              {event && (
                <>
                  <p>
                    {event.role} · {event.actor} ·{' '}
                    {i18n.date(event.at, { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                  {event.reason && (
                    <p>
                      {tr('reason')} · {event.reason}
                    </p>
                  )}
                </>
              )}
              {r.id && (
                <Button variant="outline" onClick={() => native(r.id)}>
                  {tr('openNativeNode')}
                </Button>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </section>
  )
}
function PageBody({
  page,
  order,
  book,
  choose,
  native,
  children,
  initialReceipt,
}: BookProps & { page: Page }) {
  const s = order.steps.find((s) => s.key === page.key),
    st = state(order, page),
    inherited = page.inputs.map((k) => order.steps.find((s) => s.key === k)!).filter(Boolean)
  const selectedPlan = order.steps.find((s) => s.key === 'commit')?.event?.plan
  const values = lookupEvidence(order, page.key)
  const isLogic = ['fork', 'join', 'router'].includes(page.kind)
  const exercised = !!s?.event || s?.state === 'current'
  const showPlan = (page.key === 'schedule' || page.key === 'commit') && exercised && st !== 'skipped'
  return (
    <article className="node-paper">
      <div className="head">
        <div>
          <h2>{tr(`doc_${page.key}`)}</h2>
          <p>{tr(`purpose_${page.key}`)}</p>
        </div>
        <Badge variant="secondary">{tr(st)}</Badge>
      </div>
      <p className="muted">
        {page.kind === 'terminal' ? tr(`tab_${page.key}`) : page.title} · {s?.role ?? tr('platformLogic')}
      </p>
      {st === 'skipped' && <p>{tr('notRunSkip')}</p>}
      {s?.event && (
        <p>
          {tr(s.event.authority)} · {s.event.actor} ·{' '}
          {i18n.date(s.event.at, { dateStyle: 'short', timeStyle: 'short' })}
          {s.event.reason && <> · {s.event.reason}</>}
        </p>
      )}
      {page.key === 'bom' && exercised && st !== 'rejected' && (
        <section>
          <h3>{tr('draftSample')}</h3>
          <Matrix
            headers={[tr('measure'), tr('reference'), tr('requested')]}
            rows={[
              [tr('assemblyIP'), order.sampleBOM.standardIP, order.sampleBOM.requestedIP],
              [tr('boxIP'), order.sampleBOM.terminalIP, order.sampleBOM.terminalIP],
              [tr('bolts'), order.sampleBOM.boltsBefore, order.sampleBOM.boltsAfter],
              [tr('seal'), '—', order.sampleBOM.seal + ' × 1'],
            ]}
          />
        </section>
      )}
      {page.key === 'replay' && exercised && (
        <section>
          <h3>{tr('sampleEvaluation')}</h3>
          <Matrix
            headers={[tr('clause'), tr('expertLabel'), 'R1', 'R2']}
            rows={order.sampleEvaluation.map((x) => [
              x.input,
              x.expected ?? tr('manualCheck'),
              x.before ?? tr('manualCheck'),
              x.after ?? tr('manualCheck'),
            ])}
          />
        </section>
      )}
      {showPlan && (
        <Matrix
          headers={[tr('item'), tr('firstBatch'), tr('firstDay'), tr('lastDay'), tr('costCny'), tr('impact')]}
          rows={order.plans.map((p) => [
            <>
              {p.label} {p.key === selectedPlan && <Badge>{tr('recordedChoice')}</Badge>}
            </>,
            p.firstQty,
            p.first,
            p.last,
            p.cost,
            p.impact,
          ])}
        />
      )}
      {!!values.length && (
        <section>
          <h3>{tr('branchReason')}</h3>
          <Facts facts={values} />
        </section>
      )}
      {s && !(showPlan && !s.event) && (
        <section>
          <h3>{tr(s.event ? 'savedFacts' : 'previewFacts')}</h3>
          {s.facts.length ? <Facts facts={s.facts} /> : <p className="muted">{tr('pendingRecord')}</p>}
        </section>
      )}
      <div className="desk-actions">
        {page.id && (
          <Button variant="outline" onClick={() => native(page.id)}>
            {tr(s?.state === 'current' ? 'viewProject' : 'openNativeNode')}
          </Button>
        )}
        {children}
      </div>
      {!!inherited.length && (
        <section>
          <h3>{tr(isLogic ? 'evidenceIndex' : 'sourceRecords')}</h3>
          <div className="record-grid">
            {inherited.map((input) => (
              <section className="source-record" key={input.key}>
                <Button variant="link" onClick={() => choose(input.key)}>
                  {tr(`doc_${input.key}`)}
                </Button>
                <p className="muted">
                  {input.role} · {tr(input.state)}
                </p>
                {input.event ? (
                  isLogic || page.key === 'cause' || page.kind === 'terminal' ? (
                    <Facts facts={input.event.facts} />
                  ) : (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm">
                          {tr('expandSource')}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Facts facts={input.event.facts} />
                      </CollapsibleContent>
                    </Collapsible>
                  )
                ) : (
                  <p>{tr('pendingRecord')}</p>
                )}
              </section>
            ))}
          </div>
        </section>
      )}
      {page.receipts.length > 0 && (
        <ReceiptPages initialReceipt={initialReceipt} page={page} order={order} native={native} />
      )}
      {!!page.exits.length && (
        <section>
          <h3>{tr('nextOwner')}</h3>
          {page.exits.map((e, i) => {
            const dest = book.pages.find((n) => n.key === e.to)
            if (!dest) return null
            const replayOutcome =
              page.key === 'traceRoute'
                ? order.traceRoute
                : page.key === 'materialRoute'
                ? order.materialRoute
                : s?.event?.decision === 'reject'
                ? 'reject'
                : s?.event?.decision === 'approve'
                ? s.event.plan ?? 'approve'
                : undefined
            const choice =
              e.selection ??
              (order.mode === 'rehearsal' && e.outcome && replayOutcome
                ? e.outcome === replayOutcome
                  ? 'selected'
                  : 'excluded'
                : undefined)
            return (
              <div className="caseLine" key={i}>
                <span>
                  {outcomeText(e.outcome)}{' '}
                  {choice && <Badge variant="outline">{tr(`route_${choice}`)}</Badge>}
                </span>
                <Button variant="link" onClick={() => choose(dest.key)}>
                  {tr(`tab_${dest.key}`)} ·{' '}
                  {order.steps.find((s) => s.key === dest.key)?.role ?? tr('platformLogic')}
                </Button>
              </div>
            )
          })}
        </section>
      )}
    </article>
  )
}
interface BookProps {
  order: Order
  book: NodeWorkbench
  choose: (key: DeskKey) => void
  initialReceipt?: string
  native: (nodeId?: string) => void
  children?: React.ReactNode
}
export function NodeBook(props: BookProps & { page: Page }) {
  const { book, page, choose, order, native } = props
  const tabState = (n: Page) => book.historical ? n.nativeState ?? 'unavailable' : state(order, n)
  const scoped = book.pages.filter((x) => x.stage === page.stage)
  return (
    <Tabs
      value={page.stage}
      onValueChange={(v) => {
        const items = book.pages.filter((n) => n.stage === v)
        const target = items.find((n) => tabState(n) === 'current') ?? items[0]
        if (target) choose(target.key)
      }}
    >
      <div className="stage-scroll">
        <TabsList aria-label={tr('stageTabs')}>
          {book.stages.map((st, i) => (
            <TabsTrigger key={st} value={st}>
              {tr(stageNames[i]!)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={page.stage}>
        <Tabs
          orientation="vertical"
          value={page.key}
          onValueChange={(v) => {
            const n = scoped.find((x) => x.key === v)
            if (n) choose(n.key)
          }}
          className="desk-layout"
        >
          <TabsList aria-label={tr('nodeTabs')} className="desk-index">
            {scoped.map((n) => (
              <TabsTrigger key={n.key} value={n.key} className="desk-tab">
                <span>{tr(`tab_${n.key}`)}</span>
                <span className="muted">{tr(tabState(n))}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={page.key}>
            {book.historical ? (
              <article className="node-paper">
                <h2>{tr(`doc_${page.key}`)}</h2>
                <p>{tr(tabState(page))} · {tr('receiptEvidence')} {page.evidenceCount ?? 0}</p>
                {page.id && <Button variant="outline" onClick={() => native(page.id)}>{tr('openNativeNode')}</Button>}
                {page.receipts.length > 0 && <ReceiptPages {...props} historical />}
              </article>
            ) : <PageBody {...props} />}
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  )
}
