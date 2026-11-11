import { PARSE_TIMEOUT_MS } from './constants'

export type DeliveryErrorCode =
  | 'invalid_scope'
  | 'reply_not_found'
  | 'reply_locked'
  | 'reply_empty'
  | 'reply_too_long'
  | 'order_line_not_found'
  | 'proposal_not_found'
  | 'quote_not_in_reply'
  | 'evidence_required'
  | 'invalid_date'
  | 'invalid_quantity'
  | 'invalid_batches'
  | 'invalid_proposal'
  | 'invalid_decision'
  | 'no_proposals'
  | 'order_line_changed'
  | 'parse_not_retryable'
  | 'invalid_reply_state'
  | 'review_incomplete'
  | 'concurrent_change'
  | 'invalid_page'
  | 'invalid_actor'
  | 'confirmation_in_progress'
  | 'invalid_change_type'

const messages: Partial<Record<DeliveryErrorCode, string>> = {
  confirmation_in_progress:
    'Confirmation has started; only unapplied proposals whose order lines changed can be rejected before resuming.',
  invalid_change_type: 'The change type does not match the proposed date relative to the current promised date.'
}

const nextActions: Partial<Record<DeliveryErrorCode, string>> = {
  reply_not_found: 'Read a reply in the current execution scope.',
  reply_locked: 'Read the confirmed result; do not parse or edit this reply.',
  confirmation_in_progress:
    'Reject only unapplied proposals whose order lines changed, then resume confirmation; do not parse or otherwise edit this reply.',
  invalid_change_type:
    'Choose delay, advance, or unchanged by comparing proposedDate with the order line current promisedDate.',
  order_line_not_found: 'Search the current scope and use an existing purchase order number and line number.',
  quote_not_in_reply: 'Copy an exact, nonempty substring from the stored reply.',
  evidence_required: 'Provide at least one exact source quote.',
  invalid_date: 'Use a real calendar date formatted as YYYY-MM-DD.',
  order_line_changed: 'Reload the order and review the conflicting proposal before continuing.',
  parse_not_retryable: `Wait for parsing to finish or for its ${PARSE_TIMEOUT_MS / 60_000}-minute timeout.`,
  no_proposals: 'Save at least one proposal, or report why parsing needs follow-up.',
  review_incomplete: 'Accept, edit, or reject every proposal from the current parse attempt.'
}

export class DeliveryDomainError extends Error {
  readonly nextAction: string
  constructor(
    readonly code: DeliveryErrorCode,
    readonly params: Record<string, unknown> = {}
  ) {
    super(messages[code] ?? code)
    this.name = 'DeliveryDomainError'
    this.nextAction = nextActions[code] ?? 'Reload the current record, correct the supplied fields, and retry.'
  }
}
