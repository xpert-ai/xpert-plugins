import * as React from 'react'
import { z } from 'zod/v3'
import { buttonVariants, cn, Command, CommandInput, CommandItem, CommandList, Popover, PopoverContent, PopoverTrigger, ChevronDown, ChevronRight, Check, Plus, Trash2, Badge, Button, Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardProjectSchema, dashboardProjectsSchema } from '../lib/projects.schema'
import { dashboardPickerPageSchema } from '../lib/dashboard-view.schema'
import type { DashboardMode } from '../lib/project'
import { usePickerItems } from './picker-data'
import { i18n, type messages } from './i18n'

type Project = z.infer<typeof dashboardProjectSchema>
type Messages = ReturnType<typeof messages>
type Dashboard = z.infer<typeof dashboardPickerPageSchema>['items'][number]
const projectKey = (project: Project) => project.id
const dashboardKey = (dashboard: Dashboard) => dashboard.artifactId

function ProjectColumn({ project, preview, disabled, onPreview, onSelect, t }: {
  project: Project | null; preview: Project | null; disabled: boolean; onPreview: (project: Project) => void; onSelect: (project: Project) => void; t: Messages
}) {
  const result = usePickerItems('projects', dashboardProjectsSchema, projectKey)
  const [highlight, setHighlight] = React.useState(project?.id ?? '')
  const keyboardNavigation = React.useRef(false)
  return <section className="picker-column" aria-label={t.project}>
    <div className="picker-column-heading"><h2 className="text-sm font-semibold">{t.project}</h2></div>
    <Command shouldFilter={false} value={highlight} onValueChange={id => {
      setHighlight(id)
      const item = result.items.find(item => item.id === id)
      if (keyboardNavigation.current && item && !disabled) onPreview(item)
    }} onKeyDownCapture={event => { keyboardNavigation.current = ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) }} className="picker-command">
      <CommandInput value={result.search} onValueChange={result.setSearch} aria-label={t.searchProjects} placeholder={t.searchProjects}/>
      <CommandList className="picker-list" aria-label={t.selectProject} aria-busy={result.loading} onScroll={result.onScroll}>
        {result.items.map(item => <CommandItem key={item.id} value={item.id} data-current={item.id === project?.id}
          className={item.id === preview?.id ? 'bg-secondary font-medium' : undefined} aria-current={item.id === project?.id ? true : undefined} disabled={disabled}
          onPointerEnter={() => { keyboardNavigation.current = false; if (!disabled) onPreview(item) }} onSelect={() => onSelect(item)}>
          <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>{item.id === project?.id && <Check aria-hidden="true"/>}<ChevronRight aria-hidden="true"/>
        </CommandItem>)}
        {result.loading && <p role="status" className="p-3 text-sm text-muted-foreground">{result.items.length ? t.loadingMore : t.loading}</p>}
        {result.failed && <div className="p-3"><p role="alert" className="text-sm">{t.projectsFailed}</p><Button variant="ghost" onClick={result.retry}>{t.refresh}</Button></div>}
        {!result.loading && !result.failed && !result.items.length && <p className="p-3 text-sm text-muted-foreground">{t.noProjects}</p>}
        <div ref={result.sentinel} className="h-px" aria-hidden="true"/>
      </CommandList>
    </Command>
  </section>
}

function DashboardColumn({ value, project, disabled, onChange, onNew, onDelete, t }: {
  value: string; project: Project | null; disabled: boolean; onChange: (id: string, mode?: DashboardMode) => void; onNew?: () => void; onDelete?: (dashboard: Dashboard) => void; t: Messages
}) {
  const result = usePickerItems('dashboards', dashboardPickerPageSchema, dashboardKey, project?.id)
  const [highlight, setHighlight] = React.useState(value)
  const dateFormat = new Intl.DateTimeFormat(i18n.getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  return <section className="picker-column" aria-label={t.dashboards}>
    <div className="picker-column-heading"><h2 className="text-sm font-semibold truncate" title={project?.name}>{t.dashboards}</h2>
      {onNew && project && result.data?.canEdit && <Button variant="ghost" size="sm" disabled={disabled} onClick={onNew}><Plus/>{t.newDashboard}</Button>}
    </div>
    <Command shouldFilter={false} value={highlight} onValueChange={setHighlight} className="picker-command">
      <CommandInput value={result.search} onValueChange={result.setSearch} aria-label={t.search} placeholder={t.search}/>
      <CommandList className="picker-list" aria-label={t.select} aria-busy={result.loading} onScroll={result.onScroll}>
        {result.items.map(item => {
          const date = item.updatedAt ? new Date(item.updatedAt) : null
          return <Tooltip key={item.artifactId}>
            <TooltipTrigger asChild><div className="picker-dashboard-row">
              <CommandItem value={item.artifactId} data-current={item.artifactId === value}
                className={item.artifactId === value ? 'bg-secondary font-medium' : undefined} aria-current={item.artifactId === value ? true : undefined} disabled={disabled || item.isEmpty} onSelect={() => onChange(item.artifactId, result.data?.mode)}>
                <span className="min-w-0 flex-1 truncate">{item.title ?? item.artifactId}</span>
                <Badge variant={item.isDraft || item.isEmpty ? 'outline' : 'secondary'}>{item.isEmpty ? t.unsaved : item.isDraft ? t.draft : item.versionNumber != null ? i18n.t('publishedVersion', { version: item.versionNumber }) : t.published}</Badge>
                {item.artifactId === value && <Check aria-hidden="true"/>}
              </CommandItem>
              {onDelete && item.canDelete && item.draftRevision !== undefined && <Button className="picker-delete" variant="ghost" size="icon" disabled={disabled}
                aria-label={i18n.t('deleteDashboardNamed', { title: item.title ?? item.artifactId })}
                onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation() }} onClick={() => onDelete(item)}><Trash2 aria-hidden="true"/></Button>}
            </div></TooltipTrigger>
            <TooltipContent side="top" align="start" collisionPadding={12} className="max-w-[min(18rem,calc(100vw-24px))] break-words">
              <div className="space-y-1"><p>{item.title ?? item.artifactId}</p>
                <p>{date && Number.isFinite(date.getTime()) ? i18n.t('dashboardUpdatedAt', { time: dateFormat.format(date) }) : t.updateTimeUnavailable}</p></div>
            </TooltipContent>
          </Tooltip>
        })}
        {result.loading && <p role="status" className="p-3 text-sm text-muted-foreground">{result.items.length ? t.loadingMore : t.loading}</p>}
        {result.failed && <div className="p-3"><p role="alert" className="text-sm">{t.dashboardsFailed}</p><Button variant="ghost" onClick={result.retry}>{t.refresh}</Button></div>}
        {!result.loading && !result.failed && !result.items.length && <p className="p-3 text-sm text-muted-foreground">{t.noResults}</p>}
        <div ref={result.sentinel} className="h-px" aria-hidden="true"/>
      </CommandList>
    </Command>
  </section>
}

function PickerColumns({ project, value, disabled, onChange, onNew, onDelete, t }: {
  project: Project | null; value: string; disabled: boolean; onChange: (id: string, projectId?: string, mode?: DashboardMode) => void;
  onNew?: (projectId?: string) => void; onDelete?: (dashboard: Dashboard, projectId?: string) => void; t: Messages
}) {
  const [preview, setPreview] = React.useState(project)
  const [tab, setTab] = React.useState(project ? 'dashboards' : 'projects')
  return <TooltipProvider delayDuration={250} disableHoverableContent><Tabs value={tab} onValueChange={setTab} className="picker-panels">
    <TabsList className="picker-mobile-tabs" aria-label={t.selectProjectDashboard}>
      <TabsTrigger value="projects">{t.project}</TabsTrigger><TabsTrigger value="dashboards">{t.dashboards}</TabsTrigger>
    </TabsList>
    <TabsContent value="projects" forceMount className="picker-pane picker-project-pane">
      <ProjectColumn project={project} preview={preview} disabled={disabled} onPreview={setPreview} onSelect={item => { setPreview(item); setTab('dashboards') }} t={t}/>
    </TabsContent>
    <TabsContent value="dashboards" forceMount className="picker-pane">
      <DashboardColumn key={preview?.id ?? 'personal'} project={preview} value={preview?.id === project?.id ? value : ''} disabled={disabled}
        onChange={(id, mode) => onChange(id, preview?.id, mode)} onNew={onNew ? () => onNew(preview?.id) : undefined}
        onDelete={onDelete ? item => onDelete(item, preview?.id) : undefined} t={t}/>
    </TabsContent>
  </Tabs></TooltipProvider>
}

export function DashboardPicker({ value, selectedTitle, project, disabled, open, onOpenChange, onChange, onNew, onDelete, t }: {
  value: string; selectedTitle?: string | null; project: Project | null; disabled: boolean; open: boolean;
  onOpenChange: (open: boolean) => void; onChange: (id: string, projectId?: string, mode?: DashboardMode) => void;
  onNew?: (projectId?: string) => void; onDelete?: (dashboard: Dashboard, projectId?: string) => void; t: Messages
}) {
  const contentId = React.useId()
  const title = selectedTitle ?? (value || t.select)
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger role="combobox" aria-label={t.selectProjectDashboard} aria-expanded={open} aria-controls={open ? contentId : undefined} aria-haspopup="dialog" disabled={disabled}
      className={cn(buttonVariants({ variant: 'outline' }), 'dashboard-picker justify-between')} title={`${project?.name ?? t.selectProject} / ${title}`}>
      <span className="picker-project truncate text-muted-foreground">{project?.name ?? t.selectProject}</span><ChevronRight className="shrink-0 opacity-50" aria-hidden="true"/>
      <span className="picker-dashboard truncate font-medium">{title}</span><ChevronDown className="shrink-0 opacity-50" aria-hidden="true"/>
    </PopoverTrigger>
    <PopoverContent id={contentId} aria-label={t.selectProjectDashboard} align="start" collisionPadding={12} className="dashboard-picker-menu p-0">
      <PickerColumns key={project?.id ?? 'personal'} project={project} value={value} disabled={disabled} onChange={onChange} onNew={onNew} onDelete={onDelete} t={t}/>
    </PopoverContent>
  </Popover>
}
