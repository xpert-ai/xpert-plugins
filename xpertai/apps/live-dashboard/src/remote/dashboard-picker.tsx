import * as React from 'react'
import { z } from 'zod/v3'
import { buttonVariants, cn, Command, CommandInput, CommandItem, CommandList, Popover, PopoverContent, PopoverTrigger, ChevronDown, ChevronRight, ChevronLeft, Check, Plus, Button } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardProjectSchema, dashboardProjectsSchema } from '../lib/projects.schema'
import { dashboardPickerPageSchema } from '../lib/dashboard-view.schema'
import { requestHost } from './bridge'
import type { messages } from './i18n'

type Project = z.infer<typeof dashboardProjectSchema>
type Messages = ReturnType<typeof messages>

function usePickerPage<T>(actionKey: string, schema: z.ZodType<T>) {
  const [search, setSearch] = React.useState(''), [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(true), [failed, setFailed] = React.useState(false), [retry, setRetry] = React.useState(0)
  React.useEffect(() => {
    let active = true
    setLoading(true); setFailed(false); setData(null)
    const timer = window.setTimeout(() => {
      void requestHost('executeAction', { actionKey, input: { search, page } }).then(response => {
        const next = schema.parse(z.object({ success: z.literal(true), data: z.unknown() }).parse(response).data)
        if (active) setData(next)
      }).catch(() => { if (active) setFailed(true) }).finally(() => { if (active) setLoading(false) })
    }, search ? 200 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [actionKey, schema, search, page, retry])
  return { data, search, page, loading, failed, setPage, retry: () => setRetry(value => value + 1),
    setSearch: (value: string) => { setSearch(value); setPage(1) } }
}

function Pager({ page, hasMore, disabled, onChange, label, t }: {
  page: number; hasMore: boolean; disabled: boolean; onChange: (page: number) => void; label: string; t: Messages
}) {
  return <div className="picker-pagination border-t" role="group" aria-label={label}>
    <Button variant="ghost" size="icon" aria-label={t.previousPage} disabled={disabled || page === 1} onClick={() => onChange(page - 1)}><ChevronLeft/></Button>
    <span className="text-sm text-muted-foreground" aria-live="polite">{page}</span>
    <Button variant="ghost" size="icon" aria-label={t.nextPage} disabled={disabled || !hasMore} onClick={() => onChange(page + 1)}><ChevronRight/></Button>
  </div>
}

function ProjectColumn({ project, disabled, onChange, t }: { project: Project | null; disabled: boolean; onChange: (id: string) => void; t: Messages }) {
  const result = usePickerPage('projects', dashboardProjectsSchema)
  const [highlight, setHighlight] = React.useState(project?.id ?? '')
  React.useEffect(() => { if (result.data) setHighlight(result.data.items.find(item => item.id === project?.id)?.id ?? result.data.items[0]?.id ?? '') }, [result.data, project?.id])
  return <section className="picker-column border-r" aria-label={t.project}>
    <div className="picker-column-heading"><h2 className="text-sm font-semibold">{t.project}</h2></div>
    <Command shouldFilter={false} value={highlight} onValueChange={setHighlight} className="picker-command">
      <CommandInput value={result.search} onValueChange={result.setSearch} aria-label={t.searchProjects} placeholder={t.searchProjects}/>
      <CommandList className="picker-list" aria-label={t.selectProject} aria-busy={disabled || result.loading}>
        {result.data?.items.map(item => <CommandItem key={item.id} value={item.id} data-current={item.id === project?.id}
          className={item.id === project?.id ? 'bg-secondary font-medium' : undefined} aria-current={item.id === project?.id ? true : undefined} disabled={disabled || result.loading}
          onSelect={() => { if (item.id !== project?.id) onChange(item.id) }}>
          <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>{item.id === project?.id && <Check aria-hidden="true"/>}<ChevronRight aria-hidden="true"/>
        </CommandItem>)}
        {result.loading && <p role="status" className="p-3 text-sm text-muted-foreground">{t.loading}</p>}
        {result.failed && <div className="p-3"><p role="alert" className="text-sm">{t.projectsFailed}</p><Button variant="ghost" onClick={result.retry}>{t.refresh}</Button></div>}
        {!result.loading && !result.failed && !result.data?.items.length && <p className="p-3 text-sm text-muted-foreground">{t.noProjects}</p>}
      </CommandList>
    </Command>
    <Pager page={result.page} hasMore={result.data?.hasMore ?? false} disabled={disabled || result.loading} onChange={result.setPage} label={t.projectPages} t={t}/>
  </section>
}

function DashboardColumn({ value, disabled, onChange, onNew, t }: {
  value: string; disabled: boolean; onChange: (id: string) => void; onNew?: () => void; t: Messages
}) {
  const result = usePickerPage('dashboards', dashboardPickerPageSchema)
  const [highlight, setHighlight] = React.useState(value)
  React.useEffect(() => { if (result.data) setHighlight(result.data.items.find(item => item.artifactId === value)?.artifactId ?? result.data.items[0]?.artifactId ?? '') }, [result.data, value])
  return <section className="picker-column" aria-label={t.dashboards}>
    <div className="picker-column-heading"><h2 className="text-sm font-semibold">{t.dashboards}</h2>
      {onNew && <Button variant="ghost" size="sm" disabled={disabled} onClick={onNew}><Plus/>{t.newDashboard}</Button>}
    </div>
    <Command shouldFilter={false} value={highlight} onValueChange={setHighlight} className="picker-command">
      <CommandInput value={result.search} onValueChange={result.setSearch} aria-label={t.search} placeholder={t.search}/>
      <CommandList className="picker-list" aria-label={t.select} aria-busy={disabled || result.loading}>
        {result.data?.items.map(item => <CommandItem key={item.artifactId} value={item.artifactId} data-current={item.artifactId === value}
          className={item.artifactId === value ? 'bg-secondary font-medium' : undefined} aria-current={item.artifactId === value ? true : undefined} disabled={disabled || result.loading} onSelect={() => onChange(item.artifactId)}>
          <span className="min-w-0 flex-1 truncate" title={item.title ?? item.artifactId}>{item.title ?? item.artifactId}</span>{item.artifactId === value && <Check aria-hidden="true"/>}
        </CommandItem>)}
        {result.loading && <p role="status" className="p-3 text-sm text-muted-foreground">{t.loading}</p>}
        {result.failed && <div className="p-3"><p role="alert" className="text-sm">{t.dashboardsFailed}</p><Button variant="ghost" onClick={result.retry}>{t.refresh}</Button></div>}
        {!result.loading && !result.failed && !result.data?.items.length && <p className="p-3 text-sm text-muted-foreground">{t.noResults}</p>}
      </CommandList>
    </Command>
    <Pager page={result.page} hasMore={result.data?.hasMore ?? false} disabled={disabled || result.loading} onChange={result.setPage} label={t.dashboardPages} t={t}/>
  </section>
}

export function DashboardPicker({ value, selectedTitle, project, disabled, open, onOpenChange, onChange, onProjectChange, onNew, t }: {
  value: string
  selectedTitle?: string | null
  project: Project | null
  disabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (id: string) => void
  onProjectChange: (id: string) => void
  onNew?: () => void
  t: Messages
}) {
  const contentId = React.useId()
  const title = selectedTitle ?? (value || t.select)
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger role="combobox" aria-label={t.selectProjectDashboard} aria-expanded={open} aria-controls={open ? contentId : undefined} aria-haspopup="dialog" disabled={disabled}
      className={cn(buttonVariants({ variant: 'outline' }), 'dashboard-picker justify-between font-normal')} title={`${project?.name ?? t.selectProject} / ${title}`}>
      <span className="picker-project truncate text-muted-foreground">{project?.name ?? t.selectProject}</span><ChevronRight className="shrink-0 opacity-50" aria-hidden="true"/>
      <span className="picker-dashboard truncate">{title}</span><ChevronDown className="shrink-0 opacity-50" aria-hidden="true"/>
    </PopoverTrigger>
    <PopoverContent id={contentId} aria-label={t.selectProjectDashboard} align="start" className="dashboard-picker-menu p-0">
      <ProjectColumn project={project} disabled={disabled} onChange={onProjectChange} t={t}/>
      <DashboardColumn key={project?.id ?? 'personal'} value={value} disabled={disabled} onChange={onChange} onNew={project ? onNew : undefined} t={t}/>
    </PopoverContent>
  </Popover>
}
