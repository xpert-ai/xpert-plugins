import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND, WORKBENCH_ASSISTANT_PROJECT_TARGET } from '@xpert-ai/contracts'
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import { action, command, type Host } from './bridge'
import { errorMessage } from './i18n'

const pageSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), sourceKind: z.enum(['github', 'local_git']), title: z.string(), version: z.string(), createdAt: z.string() })), next: z.string().uuid().nullable() })
export function PipelineStart({ host, review, reload }: { host: Host | null;
  review: { id: string; revision: number; status: string; ref: { provider: 'github' | 'local_git' }; pipelineProjectId?: string | null; automationRunId?: string | null }; reload: () => void }) {
  const zh = host?.locale?.startsWith('zh') ?? true, t = (cn: string, en: string) => zh ? cn : en
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [selected, setSelected] = useState(''), [error, setError] = useState('')
  const [items, setItems] = useState<z.infer<typeof pageSchema>['items']>([]), [next, setNext] = useState<string | null>(null)
  const request = useRef<{ key: string; id: string } | null>(null)
  const openTasks = async () => {
    const projectId = review.pipelineProjectId ?? host?.runtimeScope?.projectId
    if (!projectId) throw new Error('project_required')
    await command(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
      target: WORKBENCH_ASSISTANT_PROJECT_TARGET, projectId, viewKey: 'platform.project-tasks__timeline'
    })
  }
  useEffect(() => {
    if (!open) return
    let active = true
    setBusy(true); setError('')
    void action('pipeline.configurations', {}).then(value => {
      const page = pageSchema.parse(value)
      if (active) { setItems(page.items.filter(item => item.sourceKind === review.ref.provider)); setNext(page.next); setSelected('') }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'operation_failed') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [open, host?.scopeRevision, review.id])
  const start = async () => {
    if (!selected || busy) return
    const key = `${host?.scopeRevision}:${review.id}:${review.revision}:${selected}`
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
    setBusy(true); setError('')
    try {
      z.object({ projectId: z.string().uuid(), instanceId: z.string().uuid() }).parse(await action('pipeline.start-saved', {
        id: review.id, revision: review.revision, bindingId: selected, requestId: request.current.id }))
      setOpen(false); reload()
    } catch (error) { setError(error instanceof Error ? error.message : 'operation_failed') }
    finally { setBusy(false) }
  }
  if (review.pipelineProjectId) return <div className="mt-3 flex items-center gap-3 text-sm"><span className="text-muted-foreground">{t('此审查由项目流水线管理。', 'This review is managed by a Project pipeline.')}</span>
    <Button size="sm" variant="outline" onClick={() => void openTasks().catch(() => setError('operation_failed'))}>{t('查看项目流水线', 'Open Project pipelines')}</Button>
    {error && <span role="alert">{errorMessage(error, zh ? 'zh-Hans' : 'en-US')}</span>}</div>
  if (review.status !== 'ready' || review.automationRunId || !host?.runtimeScope?.projectId) return null
  return <div className="mt-3">
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{t('使用项目流水线审查', 'Review with a Project pipeline')}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0" showCloseButton={false}>
      <div className="space-y-1 border-b p-4"><DialogTitle>{t('启动审查流水线', 'Start review pipeline')}</DialogTitle>
        <DialogDescription>{review.ref.provider === 'local_git' ? t('选择本地 Git 配置；审查结果经人工确认后保存在平台。', 'Choose a local Git configuration. Approved findings stay in the platform.') : t('选择项目中已保存的审查配置。发布审查评论前需要人工确认。', 'Choose a saved Project review configuration. Posting review comments requires human approval.')}</DialogDescription></div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">{error && <p role="alert" className="text-sm text-destructive">{errorMessage(error, zh ? 'zh-Hans' : 'en-US')}</p>}
        <Select value={selected} disabled={busy} onValueChange={setSelected}><SelectTrigger aria-label={t('审查配置', 'Review configuration')}><SelectValue placeholder={t('选择已保存配置', 'Choose saved configuration')} /></SelectTrigger>
          <SelectContent>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.title} · {item.version} · {new Date(item.createdAt).toLocaleString(host?.locale)}</SelectItem>)}</SelectContent></Select>
        {!busy && !items.length && <p className="text-sm text-muted-foreground">{t('请先在项目流水线中保存 Code Review 配置。', 'Save a Code Review configuration in Project pipelines first.')}</p>}
        {next && <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
          setBusy(true)
          void action('pipeline.configurations', { after: next }).then(value => { const page = pageSchema.parse(value); setItems(previous => [...previous, ...page.items.filter(item => item.sourceKind === review.ref.provider)]); setNext(page.next) })
            .catch(error => setError(error instanceof Error ? error.message : 'operation_failed')).finally(() => setBusy(false))
        }}>{t('加载更多', 'Load more')}</Button>}
        <Button variant="link" size="sm" onClick={() => void openTasks().catch(() => setError('operation_failed'))}>{t('打开项目流水线配置', 'Open Project pipeline configuration')}</Button>
      </div>
      <div className="flex justify-end gap-2 border-t bg-muted/30 p-4"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t('关闭', 'Close')}</Button>
        <Button disabled={!selected || busy} onClick={() => void start()}>{busy ? t('正在处理…', 'Working…') : t('启动审查', 'Start review')}</Button></div>
    </DialogContent></Dialog>
  </div>
}
