import React from 'react'
import { z } from 'zod/v3'
import { repositoryConflictSchema, type RepositoryConflict } from '../../../src/repository-conflict-contract'
import { ActionError } from './bridge'
import { eventI18n } from './event-i18n'

export function conflictFromError(error: unknown): RepositoryConflict | null {
  if (!(error instanceof ActionError) || error.message !== 'repository_owned_elsewhere') return null
  const parsed = z.object({ conflict: repositoryConflictSchema }).safeParse(error.detail)
  return parsed.success ? parsed.data.conflict : null
}

export function RepositoryConflictNotice({ conflict }: { conflict: RepositoryConflict }) {
  const t = eventI18n.t
  const title = {
    other_assistant: 'automation.conflict.other_assistant',
    other_organization: 'automation.conflict.other_organization',
    other_tenant: 'automation.conflict.other_tenant'
  } as const
  const label = (identity: { id: string; label: string | null } | null) => identity
    ? identity.label || t('automation.conflict.unknown_name', { id: identity.id })
    : t('automation.conflict.not_recorded')
  return <div role="alert" className="space-y-3 border-b px-5 py-4 text-sm break-words">
    <p>{t(title[conflict.kind], { repository: `${conflict.repository.owner}/${conflict.repository.name}` })}</p>
    {conflict.kind === 'other_tenant' ? <p>{t('automation.conflict.contact_admin')}</p> : <>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{t('automation.conflict.organization')}</dt><dd>{label(conflict.organization)}</dd></div>
        <div><dt className="text-muted-foreground">{t('automation.conflict.maintainer')}</dt><dd>{label(conflict.maintainer)}</dd></div>
        <div><dt className="text-muted-foreground">{t('automation.conflict.configured_by')}</dt><dd>{label(conflict.configuredBy)}</dd></div>
        {conflict.assistant && <div><dt className="text-muted-foreground">{t('automation.conflict.assistant')}</dt><dd>{label(conflict.assistant)}</dd></div>}
        <div><dt className="text-muted-foreground">{t('automation.conflict.created_at')}</dt><dd>{eventI18n.date(conflict.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
        <div><dt className="text-muted-foreground">{t('automation.conflict.status')}</dt><dd>{t(conflict.enabled ? 'automation.automation.enabled' : 'automation.paused')}</dd></div>
      </dl>
      <p className="text-muted-foreground">{t('automation.conflict.contact_maintainer')}</p>
      <p className="text-xs text-muted-foreground">{t('automation.conflict.recorded_names')}</p>
    </>}
  </div>
}
