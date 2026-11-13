import type { CaseStatus, FailureCode } from '../../../domain/case'
import type { MessageKey } from './i18n'

export const STATUS_KEYS: Record<CaseStatus, MessageKey> = {
  draft: 'status.draft',
  analyzing: 'status.analyzing',
  suggested: 'status.suggested',
  confirmed: 'status.confirmed',
  failed: 'status.failed'
}

export const STATUS_VARIANTS: Record<CaseStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  analyzing: 'secondary',
  suggested: 'secondary',
  confirmed: 'default',
  failed: 'destructive'
}

export const FAILURE_KEYS: Record<FailureCode, MessageKey> = {
  model_call_failed: 'failure.model_call_failed',
  image_unavailable: 'failure.image_unavailable',
  no_suggestion: 'failure.no_suggestion'
}
