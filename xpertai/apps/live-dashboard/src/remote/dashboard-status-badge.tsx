import * as React from 'react'
import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import type { z } from 'zod/v3'
import type { dashboardSummarySchema } from '../lib/dashboard-view.schema'
import { i18n, type messages } from './i18n'

export function DashboardStatusBadge({ item, t }: { item: z.infer<typeof dashboardSummarySchema>; t: ReturnType<typeof messages> }) {
  return <Badge variant={item.isDraft || item.isEmpty ? 'outline' : 'secondary'}>{item.isEmpty ? t.unsaved : item.isDraft ? t.draft : item.versionNumber != null ? i18n.t('publishedVersion', { version: item.versionNumber }) : t.published}</Badge>
}
