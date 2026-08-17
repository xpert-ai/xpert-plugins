export type QuotationWorkbenchView = 'quotation' | 'review' | 'approved' | 'knowledge'

export type QuotationWorkbenchContext = {
  quotationId?: string
  quotationTitle?: string
  fileName?: string
  officeVersionNumber?: number
  activeView: QuotationWorkbenchView
  activeSheetName?: string
  selectedRange?: string
  dirty: boolean
  currentSnapshotId?: string
}

export function workbenchContextFingerprint(value: QuotationWorkbenchContext) {
  return JSON.stringify(value)
}
