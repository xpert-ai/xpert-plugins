import { t, useLocale, useMessage, type MessageKey } from './i18n'
import { ContentSearch } from './content-search'
import { Label } from '@xpert-ai/plugin-shadcn-ui'
import React, { useCallback, useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Plus, RefreshCw } from '@xpert-ai/plugin-shadcn-ui'
import { action } from './bridge'
import { proposalSchema, commentSchema, revisionSchema, revisionPreviewSchema, dateText, errorText, type Item } from './model'
import type { Selection } from './editor'
import { MarkdownText } from './markdown'
export type Panel = 'suggestions' | 'comments' | 'history' | 'knowledge' | null
type Work = { run: (work: () => Promise<void>) => Promise<void>; busy: boolean }
type Preview = z.infer<typeof revisionPreviewSchema>
export function CollaborationPanel({ panel, item, selection, canWrite, saved, run, busy, preview, onPreview, onRestored }: Work & {
  panel: Panel; item: Item; selection: Selection | null; canWrite: boolean; saved: boolean; preview: Preview | null;
  onPreview: (value: Preview | null) => void; onRestored: () => void
}) {
  useLocale()
  const [proposals, setProposals] = useState<z.infer<typeof proposalSchema>[]>([])
  const [comments, setComments] = useState<z.infer<typeof commentSchema>[]>([])
  const [revisions, setRevisions] = useState<z.infer<typeof revisionSchema>[]>([])
  const [instruction, setInstruction] = useState(''), [comment, setComment] = useState(''), [error, setError] = useMessage('')
  const [confirm, setConfirm] = useState(false)
  const refresh = useCallback(async () => {
    const [p, c, r] = await Promise.all([action('proposal.list', { itemId: item.id }), action('comment.list', { itemId: item.id }), action('page.history', { itemId: item.id })])
    setProposals(z.array(proposalSchema).parse(p)); setComments(z.array(commentSchema).parse(c)); setRevisions(z.array(revisionSchema).parse(r))
  }, [item.id])
  useEffect(() => { if (item.kind === 'page') void refresh().catch((error) => setError(errorText(error))) }, [refresh])
  if (item.kind !== 'page') return <p className="muted">{t('panel.choosePage')}</p>
  return <>{error && <p role="alert">{error}</p>}
    {panel === 'suggestions' && <>
      {canWrite && <form onSubmit={(event) => { event.preventDefault(); if (!selection) return; void run(async () => {
        await action('ai.rewrite', { itemId: item.id, blockId: selection.blockId, expectedSequence: selection.sequence, instruction }); await refresh(); setInstruction('')
      }) }}><Label>{t('proposal.request')}<Textarea required value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t('proposal.defaultRequest')} /></Label><p className="muted">{selection ? t('proposal.selectedOnly') : t('proposal.selectBlock')}</p><Button disabled={!selection || !saved || busy}>{t('proposal.generate')}</Button></form>}
      {proposals.map((proposal) => <article className="proposal" key={proposal.id}><p>{proposal.patch.reason}</p>
        <div className="before"><strong>{t('proposal.original')}</strong><MarkdownText>{proposal.patch.before}</MarkdownText></div><div className="after"><strong>{t('proposal.suggestion')}</strong><MarkdownText>{proposal.patch.after}</MarkdownText></div>
        {proposal.status === 'pending' && canWrite ? <div className="proposal-actions">{[true, false].map((accept) => <Button key={String(accept)} variant={accept ? 'default' : 'outline'} disabled={busy || !saved} onClick={() => void run(async () => { await action('proposal.decide', { proposalId: proposal.id, accept }); await refresh() })}>{accept ? t('proposal.accept') : t('proposal.reject')}</Button>)}</div> : <p className="muted">{proposal.status === 'accepted' ? t('proposal.accepted') : t('proposal.rejected')}</p>}
      </article>)}
    </>}
    {panel === 'comments' && <>{comments.map((entry) => <article className="comment" key={entry.id}><p>{entry.body}</p><span className="muted">{entry.resolved ? t('comments.resolved') : t('comments.pending')}</span>{canWrite && <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await action('comment.resolve', { commentId: entry.id, resolved: !entry.resolved }); await refresh() })}>{entry.resolved ? t('comments.reopen') : t('comments.resolve')}</Button>}</article>)}
      {!comments.length && <p className="muted">{t('comments.empty')}</p>}
      {canWrite && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await action('comment.create', { itemId: item.id, body: comment, blockId: selection?.blockId ?? null }); setComment(''); await refresh() }) }}><Textarea required aria-label={t('comments.body')} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('comments.placeholder')} /><Button disabled={busy}>{t('comments.post')}</Button></form>}
    </>}
    {panel === 'history' && <>{canWrite && <Button variant="outline" disabled={busy || !saved} onClick={() => void run(async () => { await action('page.checkpoint', { itemId: item.id, label: t('history.checkpointLabel') }); await refresh() })}><Plus />{t('history.createCheckpoint')}</Button>}
      <div className="timeline"><Button type="button" variant="ghost" className={!preview ? 'current' : ''} onClick={() => onPreview(null)}><strong>{t('history.current')}</strong><small>{dateText(item.updatedAt)}</small></Button>
        {revisions.map((revision) => <Button type="button" variant="ghost" key={revision.id} className={preview?.id === revision.id ? 'current' : ''} disabled={!saved} onClick={() => void run(async () => onPreview(revisionPreviewSchema.parse(await action('page.preview', { itemId: item.id, revisionId: revision.id }))))}><strong>{revision.label}</strong><small>{t('history.versionMeta', { date: dateText(revision.createdAt), version: revision.sequence })}</small></Button>)}</div>
      {preview && canWrite && <div className="restore-footer"><p className="muted">{t('history.preserveNote')}</p><Button disabled={busy || !saved} onClick={() => setConfirm(true)}>{t('history.restoreVersion')}</Button><p className="muted">{t('history.confirmNext')}</p></div>}
    </>}
    {confirm && preview && <Dialog open onOpenChange={() => setConfirm(false)}><DialogContent><DialogHeader><DialogTitle>{t('history.restoreTitle', { title: preview.label })}</DialogTitle><DialogDescription>{t('history.restoreDescription')}</DialogDescription></DialogHeader><div className="row"><Button variant="outline" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button disabled={busy} onClick={() => void run(async () => {
      const current = z.object({ sequence: z.number() }).parse(await action('page.read', { itemId: item.id }))
      await action('page.restore', { itemId: item.id, revisionId: preview.id, expectedSequence: current.sequence })
      setConfirm(false); onRestored(); await refresh()
    })}>{t('history.confirmRestore')}</Button></div></DialogContent></Dialog>}
  </>
}
const knowledgeSchema = z.object({ knowledgebaseId: z.string().nullable(), items: z.array(z.object({
  itemId: z.string(), title: z.string(), status: z.string(), error: z.string().nullable(),
  document: z.object({ status: z.string().nullable().optional() }).nullable()
})) })
const knowledgeStatusKeys: Record<string, MessageKey> = {
  pending: 'knowledge.pending', processing: 'knowledge.processing', ready: 'knowledge.ready', failed: 'knowledge.failed'
}
const knowledgeStatus = (status: string) => t(knowledgeStatusKeys[status] ?? 'knowledge.pending')
export function KnowledgePanel({ root, canWrite, canManage, run, busy }: Work & { root: Item; canWrite: boolean; canManage: boolean }) {
  useLocale()
  const [knowledge, setKnowledge] = useState<z.infer<typeof knowledgeSchema> | null>(null), [error, setError] = useMessage('')
  const refresh = useCallback(async () => setKnowledge(knowledgeSchema.parse(await action('knowledge.status', { spaceId: root.id }))), [root.id])
  useEffect(() => { void refresh().catch((error) => setError(errorText(error))) }, [refresh])
  return <><p className="muted">{t('knowledge.description')}</p>{error && <p role="alert">{error}</p>}
    {!knowledge?.knowledgebaseId ? <Button disabled={!canManage || busy} onClick={() => void run(async () => { await action('knowledge.enable', { spaceId: root.id }); await refresh() })}>{t('knowledge.enable')}</Button> : <><p>{t('knowledge.linked')}</p><Button variant="outline" disabled={!canWrite || busy} onClick={() => void run(async () => { await action('knowledge.refresh', { spaceId: root.id }); await refresh() })}><RefreshCw />{t('knowledge.sync')}</Button><Button variant="ghost" onClick={() => void run(refresh)}>{t('knowledge.refresh')}</Button></>}
    {knowledge?.knowledgebaseId && <ContentSearch spaceId={root.id} run={run} busy={busy} />}
    {knowledge?.items.map((item) => <div className="index-item" key={item.itemId}><strong>{item.title}</strong><small>{knowledgeStatus(item.status)}</small>{item.error && <p role="status">{t('knowledge.failureNote')}</p>}</div>)}
  </>
}
export function AskDialog({ root, run, busy, onClose, onOpen }: Work & { root: Item; onClose: () => void; onOpen: (id: string) => void }) {
  useLocale()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<{ answer: string; citations: Array<{ itemId: string; title: string; sequence: number; excerpt: string }> } | null>(null)
  return <Dialog open onOpenChange={onClose}><DialogContent className="space-dialog"><DialogHeader><DialogTitle>{t('knowledge.askTitle')}</DialogTitle><DialogDescription>{t('knowledge.accessNote')}</DialogDescription></DialogHeader>
    <form onSubmit={(event) => { event.preventDefault(); void run(async () => setAnswer(z.object({ answer: z.string(), citations: z.array(z.object({ itemId: z.string(), title: z.string(), sequence: z.number(), excerpt: z.string() })) }).parse(await action('ai.answer', { resourceId: root.id, query: question })))) }}><Textarea aria-label={t('knowledge.question')} required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t('knowledge.placeholder')} /><Button disabled={busy}>{t('knowledge.ask')}</Button></form>
    {answer && <div className="answer">{answer.answer || t('knowledge.noSources')}{answer.citations.map((citation, index) => <Button key={index} variant="outline" title={citation.excerpt} onClick={() => onOpen(citation.itemId)}>{citation.title} · {t('common.version', { version: citation.sequence })}</Button>)}</div>}
  </DialogContent></Dialog>
}
