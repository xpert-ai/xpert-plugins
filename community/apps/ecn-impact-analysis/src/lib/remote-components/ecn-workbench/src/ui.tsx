import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import { useI18n } from './i18n'
import type { EcnAssessmentStatus, EcnImpactDomain, EcnImpactItemStatus, EcnRiskLevel } from '../../../contracts'

const STATUS_VARIANT: Record<EcnAssessmentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  analyzing: 'outline',
  ai_completed: 'default',
  confirmed: 'outline',
  closed: 'secondary'
}

export function StatusBadge({ status }: { status: EcnAssessmentStatus }) {
  const { t } = useI18n()
  return (
    <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
      {t(`status_${status}` as const)}
    </Badge>
  )
}

const RISK_CLASS: Record<EcnRiskLevel, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
}

export function RiskBadge({ risk }: { risk?: EcnRiskLevel }) {
  const { t } = useI18n()
  if (!risk) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_CLASS[risk]}`}>
      {t(`risk_${risk}` as const)}
    </span>
  )
}

export function DomainBadge({ domain }: { domain: EcnImpactDomain }) {
  const { t } = useI18n()
  return (
    <Badge variant="outline" className="shrink-0 font-normal">
      {t(`domain_${domain}` as const)}
    </Badge>
  )
}

const ITEM_VARIANT: Record<EcnImpactItemStatus, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary',
  accepted: 'default',
  rejected: 'outline'
}

export function ItemStatusBadge({ status }: { status: EcnImpactItemStatus }) {
  const { t } = useI18n()
  const label =
    status === 'pending' ? t('item_pending') : status === 'accepted' ? t('item_accepted') : t('item_rejected')
  const className =
    status === 'rejected'
      ? 'shrink-0 border-red-300 text-red-600 dark:border-red-800 dark:text-red-400'
      : 'shrink-0'
  return (
    <Badge variant={ITEM_VARIANT[status]} className={className}>
      {label}
    </Badge>
  )
}

export function formatTime(iso: string, locale: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return iso
  }
}
