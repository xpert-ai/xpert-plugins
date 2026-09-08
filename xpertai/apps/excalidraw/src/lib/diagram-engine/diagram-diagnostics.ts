import type { DiagramQualityIssue, DiagramValidationReport } from './diagram.types.js'

/** Bounded repair details shared by validation receipts and rejected operations. */
export function diagramDiagnostics(
  report: Pick<DiagramValidationReport, 'valid' | 'issues'> & {
    summary: Pick<DiagramValidationReport['summary'], 'errors' | 'warnings'>
  }
) {
  return {
    valid: report.valid,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    issues: report.issues.slice(0, 20).map(diagramIssueDto),
    issueTotal: report.issues.length,
    ...(report.issues.length > 20 ? { nextIssueOffset: 20 } : {})
  }
}

export function diagramIssueDto(issue: DiagramQualityIssue) {
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message.slice(0, 1000),
    targetIds: issue.targetIds,
    ...(issue.correctionIntent ? { correctionIntent: issue.correctionIntent.slice(0, 1000) } : {})
  }
}
