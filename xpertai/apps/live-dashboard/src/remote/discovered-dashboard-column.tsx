import * as React from 'react'
import {
  Badge,
  Button,
  Check,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  Plus,
  Tabs,
  TabsList,
  TabsTrigger,
  Trash2
} from '@xpert-ai/plugin-shadcn-ui'
import type { z } from 'zod/v3'
import type { dashboardSummarySchema } from '../lib/dashboard-view.schema'
import type { DashboardMode } from '../lib/project'
import { DashboardStatusBadge } from './dashboard-status-badge'
import { discoveryKey, useDashboardDiscovery, type DiscoveryOrigin } from './dashboard-discovery-data'
import { i18n, type messages } from './i18n'

type Dashboard = z.infer<typeof dashboardSummarySchema>
export function DiscoveredDashboardColumn({
  projectId,
  value,
  disabled,
  onChange,
  onShared,
  onNew,
  onDelete,
  t
}: {
  projectId: string
  value: string
  disabled: boolean
  onChange: (id: string, mode?: DashboardMode) => void
  onShared: (referenceId: string) => void
  onNew?: () => void
  onDelete?: (dashboard: Dashboard) => void
  t: ReturnType<typeof messages>
}) {
  const [origin, setOrigin] = React.useState<DiscoveryOrigin>('all')
  const result = useDashboardDiscovery(projectId, origin)
  const [highlight, setHighlight] = React.useState('')
  return (
    <section className="picker-column" aria-label={t.availableDashboards}>
      <div className="picker-column-heading">
        <h2 className="text-sm font-semibold">{t.availableDashboards}</h2>
        {onNew && result.data?.canEdit && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onNew}>
            <Plus aria-hidden="true" />
            {t.newDashboard}
          </Button>
        )}
      </div>
      <Tabs
        value={origin}
        onValueChange={(value) => {
          if (value === 'all' || value === 'project' || value === 'shared') setOrigin(value)
        }}
        className="px-3 pb-2"
      >
        <TabsList aria-label={t.dashboardOrigins} className="w-full">
          <TabsTrigger value="all" className="flex-1">
            {t.discoveryAll}
          </TabsTrigger>
          <TabsTrigger value="project" className="flex-1">
            {t.discoveryProject}
          </TabsTrigger>
          <TabsTrigger value="shared" className="flex-1" disabled={result.data?.sharedAvailable === false}>
            {t.discoveryShared}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Command shouldFilter={false} value={highlight} onValueChange={setHighlight} className="picker-command">
        <CommandInput
          value={result.search}
          onValueChange={result.setSearch}
          aria-label={t.discoverySearch}
          placeholder={t.discoverySearch}
        />
        <CommandList
          onScroll={result.onScroll}
          className="picker-list"
          aria-label={t.availableDashboards}
          aria-busy={result.loading}
        >
          {result.items.map((item) => {
            const shared = item.resource.kind === 'group-reference'
            const current = !shared && item.dashboard?.artifactId === value
            return (
              <div key={discoveryKey(item)} className="picker-dashboard-row">
                <CommandItem
                  aria-label={item.title}
                  value={discoveryKey(item)}
                  disabled={disabled || !item.access.canOpen}
                  className={current ? 'bg-secondary font-medium' : undefined}
                  aria-current={current ? true : undefined}
                  onSelect={() => {
                    if (shared) onShared(item.resource.id)
                    else if (item.dashboard) onChange(item.dashboard.artifactId, result.data?.mode)
                  }}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate" title={item.title}>
                      {item.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{shared ? t.discoveryShared : t.discoveryProject}</span>
                      {!shared && item.dashboard && <DashboardStatusBadge item={item.dashboard} t={t} />}
                      {item.publication && (
                        <span>· {i18n.t('publishedVersion', { version: item.publication.versionNumber })}</span>
                      )}
                      <Badge variant="secondary">
                        {item.access.canEdit ? t.discoveryEditable : t.discoveryReadOnly}
                      </Badge>
                      {item.access.analysis !== 'none' && (
                        <Badge variant="outline">
                          {item.access.analysis === 'explore' ? t.discoveryExplore : t.discoveryQuery}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {current && <Check aria-hidden="true" />}
                </CommandItem>
                {!shared && onDelete && item.dashboard?.canDelete && item.dashboard.draftRevision && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="picker-delete"
                    disabled={disabled}
                    aria-label={i18n.t('deleteDashboardNamed', { title: item.title })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.stopPropagation()
                    }}
                    onClick={() => {
                      if (item.dashboard) onDelete(item.dashboard)
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            )
          })}
          {result.loading && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              {result.items.length ? t.loadingMore : t.loading}
            </p>
          )}
          {result.failed && (
            <div className="space-y-2 p-3">
              <p role="alert" className="text-sm">
                {t.dashboardsFailed}
              </p>
              <Button variant="outline" onClick={result.loadMore}>
                {t.refresh}
              </Button>
            </div>
          )}
          {!result.loading && !result.failed && !result.items.length && !result.cursor && (
            <div className="space-y-2 p-4 text-sm text-muted-foreground">
              <p>{result.search ? t.discoveryNoMatch : origin === 'shared' ? t.discoveryNoShares : t.discoveryEmpty}</p>
              {result.search && (
                <Button variant="ghost" onClick={() => result.setSearch('')}>
                  {t.discoveryClearSearch}
                </Button>
              )}
            </div>
          )}
          {!result.loading && !result.failed && result.cursor && (
            <Button variant="ghost" className="w-full" onClick={result.loadMore}>
              {t.loadMore}
            </Button>
          )}
        </CommandList>
      </Command>
      {origin === 'shared' && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t.discoverySharedHint}</p>
      )}
    </section>
  )
}
