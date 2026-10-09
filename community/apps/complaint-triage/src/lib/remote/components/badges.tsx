import type { TicketStatus } from '../../domain/contracts.js'
import type { Severity } from '../../domain/policy.js'
import { useServices } from '../context.js'

// Status and severity are always text plus colour, never colour alone.
export function StatusPill({ status }: { status: TicketStatus }) {
  const { t } = useServices()
  return <span className={`ct-pill ct-status-${status}`}>{t(`status.${status}`)}</span>
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useServices()
  return <span className={`ct-pill ct-severity-${severity}`}>{t(`severity.${severity}`)}</span>
}
