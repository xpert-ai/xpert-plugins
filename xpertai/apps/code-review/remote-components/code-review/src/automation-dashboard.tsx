import React, { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { GitPullRequest, Link2, RefreshCw, ArrowUpRight, Plus, LoaderCircle, Check, Settings2, Inbox, FolderGit2 } from 'lucide-react'
import { Button, Input, Textarea, Checkbox, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { data, action, type Host } from './bridge'
import { policySettingsSchema, runStatusSchema, type PolicySettings } from '../../../src/automation-contract'
import { RepositoryPipeline, openPipeline } from './repository-pipeline'
import { usePipelineConfiguration } from './pipeline-setup'
import type { ReviewPipelineChoice } from '../../../src/pipeline/setup-contract'
import { i18n, errorMessage } from './i18n'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { connectGitHubAccount } from './github-authorization'
import { useGitHubConnection } from './use-github-connection'
import { EventSettings } from './event-settings'
import { eventI18n, eventMessage } from './event-i18n'
import { GitHubSetupGuide } from './github-setup-guide'

const repositorySchema = z.object({ id: z.string(), owner: z.string(), repository: z.string(), revision: z.number(), settings: policySettingsSchema,
  ownership: z.enum(['user', 'organization', 'assistant']).default('user'), configuredById: z.string().nullish(), userId: z.string(), updatedById: z.string().nullish(), responsibleUserId: z.string().nullish(), assistantId: z.string(), workspaceId: z.string(), executionUserId: z.string().nullish(),
  updatedAt: z.string(), lastEventAt: z.string().nullable(), errorCode: z.string().nullable() })
const runSchema = z.object({ id: z.string(), repositoryPolicyId: z.string(), title: z.string(), number: z.number(), headSha: z.string(), trigger: z.string(), status: runStatusSchema,
  settings: policySettingsSchema, pipelineInstanceId: z.string().nullish(), pipelineRoundId: z.string().nullish(), reason: z.string().nullable(), reviewId: z.string().nullable(), policyRevision: z.number(), createdAt: z.string(), publicationUrl: z.string().nullable() })
const overviewSchema = z.object({ meta: z.object({ repositories: z.array(repositorySchema), runs: z.array(runSchema), total: z.number(),
  access: z.object({ canRead: z.boolean(), canManage: z.boolean(), organizationName: z.string() }), labels: z.object({ users: z.array(z.object({ id: z.string(), label: z.string() })), assistants: z.array(z.object({ id: z.string(), label: z.string() })), workspaces: z.array(z.object({ id: z.string(), label: z.string() })) }),
  app: z.object({ integrationId: z.string().nullable().optional(), integrationName: z.string().nullable().optional(), errorCode: z.string().nullable().optional(), configured: z.boolean(), installUrl: z.string().nullable(), webhookUrl: z.string().nullable() }) }) })
type Overview = z.infer<typeof overviewSchema>['meta']
type Repo = z.infer<typeof repositorySchema>
type Run = z.infer<typeof runSchema>
type Props = { host: Host | null; section: 'repositories' | 'settings'; onNavigate: (section: 'inbox' | 'repositories' | 'settings') => void }
export function AutomationDashboard({ host, section: view, onNavigate: setView }: Props) {
  const { t: text } = i18n(host?.locale)
  const locale = useRemoteLocale(eventI18n)
  const t = eventI18n.t
  const [overview, setOverview] = useState<Overview | null>(null), [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [editing, setEditing] = useState<Repo | null>(null), [settings, setSettings] = useState<PolicySettings | null>(null), [trial, setTrial] = useState('')
  const [history, setHistory] = useState<Array<{ revision: number; actorId: string; action: string; createdAt: string }>>([])
  const [pipelineChoice, setPipelineChoice] = useState<ReviewPipelineChoice | null>(null)
  const configurePipeline = usePipelineConfiguration(host, 'github')
  const [confirm, setConfirm] = useState<{ title: () => string; description: () => string; execute: () => Promise<unknown> } | null>(null)
  const { connection, refresh: refreshConnection } = useGitHubConnection(host)
  const generation = useRef(0)
  const load = useCallback(async () => {
    if (!host) return
    const n = ++generation.current
    try { const result = overviewSchema.parse(await data({ parameters: { automation: true } })); if (generation.current === n) setOverview(result.meta) }
    catch (e) { if (generation.current === n) setError(e instanceof Error ? e.message : 'operation_failed') }
  }, [host])
  useEffect(() => { void load(); const interval = setInterval(() => void load(), 10000); return () => { generation.current++; clearInterval(interval) } }, [load])
  async function perform(fn: () => Promise<unknown>) {
    setWorking(true); setError('')
    try { await fn(); setConfirm(null); await load() }
    catch (e) { setConfirm(null); setError(e instanceof Error ? e.message : 'operation_failed') }
    finally { setWorking(false) }
  }
  const explain = (code: string) => eventMessage(code) ?? errorMessage(code, locale)
  const disabled = working || !host || !overview?.access.canManage
  const label = (kind: 'users' | 'assistants' | 'workspaces', id?: string | null) => overview?.labels[kind].find(item => item.id === id)?.label ?? t('automation.unavailable.or.departed')
  const patch = (change: Partial<PolicySettings>) => setSettings(s => s ? { ...s, ...change } : s)
  const openSettings = (repo: Repo) => { setEditing(repo); setHistory([]); setPipelineChoice(null); setSettings(structuredClone(repo.settings)); setView('repositories') }
  return <RemoteI18nProvider i18n={eventI18n}><div className="flex h-full min-h-0 flex-col bg-background text-foreground">
    {error && <div role="alert" className="border-b bg-muted px-5 py-3 text-sm">{explain(error)}</div>}
    <main className="min-h-0 flex-1 overflow-auto p-5">
      {!overview ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>{t('automation.loading.reviews')}</p> : <>
        {view === 'repositories' && <div className="space-y-6"><section><h2 className="text-lg font-semibold">{t('automation.connect.repositories')}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('automation.your.account.verifies.repository.authority.the.github')}</p>{overview.app.integrationName && <p className="mt-2 text-sm">{t('automation.github.system.integration')}{overview.app.integrationName}</p>}{overview.app.errorCode && <p role="alert" className="mt-2 text-sm">{explain(overview.app.errorCode)}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button disabled={disabled || connection.status === 'loading'} variant="outline" onClick={() => void perform(async () => {
            try { await connectGitHubAccount(overview.app.integrationId) }
            finally { await refreshConnection() }
          })}>
            {connection.status === 'loading' ? <LoaderCircle className="size-4 animate-spin"/> : connection.status === 'connected' ? <Check className="size-4"/> : <Link2 className="size-4"/>}
            {connection.status === 'loading' ? t('automation.checking.github.connection') : connection.status === 'connected' ? `${t('automation.github.connected')} · @${connection.login}` : t('automation.connect.github')}
          </Button>{overview.app.installUrl && <Button variant="outline" asChild><a href={overview.app.installUrl} target="_blank" rel="noreferrer">{t('automation.install.app.manage.access')}<ArrowUpRight className="size-4"/></a></Button>}</div>{connection.status === 'integration_mismatch' && <p role="alert" className="mt-2 text-sm text-muted-foreground">{explain('github_integration_mismatch')}</p>}{connection.status === 'unavailable' && <p role="status" className="mt-2 text-sm text-muted-foreground">{t('automation.github.connection.status.is.temporarily.unavailable.refresh')}</p>}{!overview.app.configured && <div className="mt-4 rounded-lg bg-muted p-4 text-sm leading-6">{t('automation.github.app.is.not.configured.an.administrator')}<Button variant="link" className="h-auto px-1" onClick={() => setView('settings')}>{t('automation.setup.instructions')}</Button></div>}
          <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); const match = repoInput.trim().match(/^([\w.-]+)\/([\w.-]+)$/); if (!match) { setError('invalid_input'); return }; void perform(async () => { await action('repository.add', { owner: match[1], repository: match[2] }); setRepoInput('') }) }}><Input aria-label={t('automation.repository.name')} placeholder="owner/repository" value={repoInput} onChange={e => setRepoInput(e.target.value)} required/><Button disabled={disabled || !overview.app.configured || !repoInput}><Plus className="size-4"/>{t('automation.add.repository')}</Button></form></section>
          <section className="divide-y border-t">{overview.repositories.map(repo => <div key={repo.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><h3 className="text-sm font-medium">{repo.owner}/{repo.repository}</h3><p className="mt-1 text-xs text-muted-foreground">{repo.errorCode ? t('automation.needs.attention') : repo.settings.enabled ? t('automation.automation.enabled') : t('automation.paused')} · {repo.settings.delivery === 'draft' ? t('automation.confirm.before.publishing') : t('automation.automatic.comments')} · v{repo.revision}</p><p className="mt-2 text-xs text-muted-foreground">{t('automation.owner')}{repo.ownership === 'assistant' ? overview.access.organizationName : t('automation.legacy.personal.policy')} · {t('automation.configured.by')}{label('users', repo.configuredById ?? repo.userId)} · {t('automation.maintainer')}{label('users', repo.responsibleUserId)}</p><p className="mt-1 text-xs text-muted-foreground">{t('automation.last.updated')}{label('users', repo.updatedById)}</p><p className="mt-1 text-xs text-muted-foreground">{t('automation.execution')}{label('assistants', repo.assistantId)} / {label('workspaces', repo.workspaceId)} · {repo.executionUserId && repo.ownership === 'assistant' ? t('automation.assistant.execution.account') : t('automation.assistant.binding.required')}</p>{repo.errorCode && <p className="mt-2 text-xs text-destructive">{explain(repo.errorCode)}</p>}<p className="mt-1 text-xs text-muted-foreground">{repo.lastEventAt ? t('automation.last.event') + eventI18n.date(repo.lastEventAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('automation.no.github.events.received.yet')}</p></div><Button size="sm" variant="outline" disabled={disabled} onClick={() => openSettings(repo)}>{t('automation.configure.rules')}</Button></div>)}</section>
          {editing && settings && <section className="space-y-5 rounded-xl border p-5"><div><h2 className="font-semibold">{editing.owner}/{editing.repository}</h2><p className="mt-1 text-xs text-muted-foreground">{t('automation.rules.retain.the.bound.assistant.rebinding.is')}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} onClick={() => { setWorking(true); void (async () => {
              const preview = z.object({ blocked: z.boolean(), revision: z.number(), targetLabels: z.object({ assistant: z.string(), workspace: z.string() }) }).parse(await action('repository.preview', { id: editing.id, revision: editing.revision }))
              if (preview.blocked) throw new Error('publication_reconciliation_required')
              setConfirm({ title: () => t('automation.bind.to.this.assistant.confirm'),
                description: () => t('automation.binding.preview', preview.targetLabels),
                execute: async () => { await action('repository.bind', { id: editing.id, revision: preview.revision }); setEditing(null) } })
            })().catch(e => setError(e instanceof Error ? e.message : 'operation_failed')).finally(() => setWorking(false)) }}>{t('automation.bind.to.this.assistant')}</Button>
            <Button variant="outline" disabled={disabled} onClick={() => void perform(async () => { await action('repository.maintain', { id: editing.id, revision: editing.revision }); setEditing(null) })}>{t('automation.assign.me.as.maintainer')}</Button>
            <Button variant="outline" disabled={disabled} onClick={() => void perform(async () => { const result = await action('repository.history', { id: editing.id, revision: editing.revision }); setHistory(z.array(z.object({ revision: z.number(), actorId: z.string(), action: z.string(), createdAt: z.string() })).parse(result)) })}>{t('automation.configuration.history')}</Button>
</div>{history.length > 0 && <ol className="space-y-1 text-xs text-muted-foreground">{history.map(row => <li key={row.revision}>v{row.revision} · {label('users', row.actorId)} · {({ created: t('automation.created'), saved: t('automation.rules.updated'), adopted: t('automation.adopted'), rebound: t('automation.execution.rebound'), revoked: t('automation.revoked'), maintained: t('automation.maintainer.updated') } as Record<string, string>)[row.action] ?? row.action} · {eventI18n.date(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</li>)}</ol>}<label className="flex items-center gap-2 text-sm"><Checkbox checked={settings.enabled} onCheckedChange={v => patch({ enabled: v === true })}/>{t('automation.enable.automatic.reviews')}</label><fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">{t('automation.triggers')}</legend>{([['onOpened', t('automation.pr.opened.or.reopened')], ['onReady', t('automation.draft.marked.ready')], ['onPush', t('automation.new.commits.30.second.debounce')], ['includeBots', t('automation.include.bot.authored.prs')]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={settings[key]} onCheckedChange={v => patch({ [key]: v === true })}/>{label}</label>)}</fieldset><EventSettings settings={settings} onChange={patch} locale={host?.locale}/>{settings.executionMode === 'pipeline' && <RepositoryPipeline key={`${editing.id}:${host?.scopeRevision}:${host?.runtimeScope?.projectId}`} host={host} target={editing.settings.pipeline} disabled={disabled} onChange={setPipelineChoice}/>}<p className="text-sm text-muted-foreground">{settings.executionMode === 'pipeline' ? text('projectGateHelp') : ''}</p><label className="block text-sm">{t('automation.base.branches.one.per.line.empty.means')}<Textarea className="mt-2" value={settings.branches.join('\n')} onChange={e => patch({ branches: e.target.value.split('\n') })}/></label><label className="block text-sm">{t('automation.ignored.paths.one.glob.per.line')}<Textarea className="mt-2" value={settings.ignoredPaths.join('\n')} onChange={e => patch({ ignoredPaths: e.target.value.split('\n') })}/></label><label className="block text-sm">{t('automation.additional.review.guidance')}<Textarea className="mt-2" value={settings.instructions} maxLength={6000} onChange={e => patch({ instructions: e.target.value })}/></label><label className="block text-sm">{t('automation.daily.review.limit.utc.including.trials')}<Input className="mt-2 max-w-32" type="number" min={1} max={200} value={settings.dailyLimit} onChange={e => patch({ dailyLimit: Number(e.target.value) })}/></label><div className="flex flex-wrap gap-2"><Button disabled={disabled || (settings.executionMode === 'pipeline' && !pipelineChoice && !settings.pipeline)} onClick={() => setConfirm({ title: () => t('automation.save.review.rules.confirm'), description: () => settings.executionMode === 'assistant' ? eventI18n.t('assistantHelp') : text(settings.enabled ? 'enableRepositoryPipeline' : 'saveRepositoryPipeline'), execute: async () => { const pipeline = settings.executionMode === 'pipeline' ? (pipelineChoice ? await configurePipeline(pipelineChoice) : settings.pipeline) : null; await action('repository.save', { id: editing.id, revision: editing.revision, settings: { ...settings, pipeline, visibility: settings.executionMode === 'pipeline' ? 'project' : editing.ownership === 'assistant' ? 'organization' : 'private', delivery: 'draft', workflows: settings.workflows.map(v => v.trim()).filter(Boolean), branches: settings.branches.map(v => v.trim()).filter(Boolean), ignoredPaths: settings.ignoredPaths.map(v => v.trim()).filter(Boolean) }, confirmed: true }); setEditing(null); setSettings(null) } })}>{t('automation.save.rules')}</Button><Button variant="ghost" onClick={() => setEditing(null)}>{t('automation.cancel')}</Button></div><form className="flex flex-wrap gap-2 border-t pt-4" onSubmit={e => { e.preventDefault(); void perform(async () => { await action('repository.trial', { id: editing.id, number: Number(trial) }); setView('inbox') }) }}><Input type="number" aria-label={t('automation.trial.pr.number')} className="max-w-40" placeholder="PR #" min={1} required value={trial} onChange={e => setTrial(e.target.value)}/><Button variant="outline" disabled={disabled || !trial}>{t('automation.try.review.no.publishing')}</Button></form></section>}
        </div>}
        {view === 'settings' && <GitHubSetupGuide app={overview.app}/>}
      </>}
    </main>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !working) setConfirm(null) }}><AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto"><AlertDialogHeader><AlertDialogTitle>{confirm?.title()}</AlertDialogTitle><AlertDialogDescription>{confirm?.description()}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={working} onClick={() => setConfirm(null)}>{t('automation.cancel')}</Button><Button disabled={working} onClick={() => confirm && void perform(confirm.execute)}>{working && <LoaderCircle className="size-4 animate-spin"/>}{t('automation.confirm')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></RemoteI18nProvider>
}
