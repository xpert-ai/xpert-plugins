import * as React from 'react'
import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import { statusKey, useI18n } from './i18n'

export function Status({ value }: { value: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="outline" className={`status-${value}`}>
      {t(statusKey[value] ?? 'status')}
    </Badge>
  )
}
