import { createHash } from 'node:crypto'
import type { ContentTransferSnapshot } from '@xpert-ai/contracts'
import { analysisEvidenceDigestInput, parseAnalysisEvidence } from '@xpert-ai/plugin-sdk/analytics'

/** All values remain literal text. Each displayed observation carries its fixed source/cell reference. */
export function documentFromTransfer(id: string, title: string, transfer?: ContentTransferSnapshot) {
  const lines = [title]
  if (transfer?.schema === 'xpert.content-analysis-transfer@1') {
    const evidence = parseAnalysisEvidence(transfer.evidence)
    if (createHash('sha256').update(analysisEvidenceDigestInput(evidence)).digest('hex') !== evidence.sha256)
      throw new Error('office.evidence_integrity_failed')
    lines.push(`证据快照 / Evidence: ${evidence.id}`, `SHA-256: ${evidence.sha256}`, `查询快照 / Captured: ${evidence.capturedAt}`,
      `来源版本 / Source version: ${evidence.source.artifactId}/${evidence.source.versionId}`, `参数 / Controls: ${JSON.stringify(evidence.controls)}`,
      '认证与数据时间均为快照时的记录 / Certification and freshness describe capture time.')
    for (const dataset of evidence.datasets) {
      lines.push(dataset.datasetId, `完整性 / Completeness: ${dataset.completeness.scope}; ${dataset.completeness.returnedRows} rows; truncated=${dataset.completeness.truncated}; total=${dataset.completeness.totalRows ?? "unknown"}; accuracy=${dataset.completeness.totalAccuracy}`,
        `Executed: ${dataset.freshness.executedAt}; fetched: ${dataset.freshness.sourceFetchedAt}`)
      if (dataset.provenance.certification) lines.push(`Certification: ${JSON.stringify(dataset.provenance.certification)}`)
      dataset.rows.forEach((row, index) => lines.push(dataset.fields.map(field => `${field.label}: ${String(row[field.id])}${field.unit ? ' ' + field.unit : ''} [${dataset.datasetId}:${index}:${field.id}]`).join('; ')))
    }
    for (const statement of evidence.statements.filter(item => item.kind !== 'fact')) lines.push(`[${statement.kind}] ${statement.text}`)
  } else if (transfer?.schema === 'xpert.content-transfer@1') {
    lines.push(`来源 / Source: ${transfer.source.providerKey}:${transfer.source.resourceId}@${transfer.source.revision}`)
    for (const section of transfer.sections) lines.push(`[${section.anchor.kind}:${section.anchor.id}] ${section.text}`)
  }
  const text = lines.map(line => line.replace(/\r/g, '\n')).join('\r') + '\r\n'
  if (Buffer.byteLength(text) > 2_000_000) throw new Error('office.document_size_limit')
  let offset = 0
  const paragraphs = lines.map(line => { offset += line.replace(/\r/g, '\n').length; const startIndex = offset; offset++; return { startIndex } })
  return { snapshot: { id, title, body: { dataStream: text, textRuns: [], paragraphs },
    ...(transfer ? { xpertSource: transfer.source } : {}), ...(transfer?.schema === 'xpert.content-analysis-transfer@1' ? { xpertEvidence: { id: transfer.evidence.id, sha256: transfer.evidence.sha256 } } : {}) }, text }
}

/** Fixed, editable text slides; no formulas, generated claims or external assets. */
export function presentationFromTransfer(id: string, title: string, transfer?: ContentTransferSnapshot) {
  const document = documentFromTransfer(id, title, transfer)
  const rawLines = document.text.split('\r').filter(line => line.trim())
  // Lead with observations. Full provenance remains on editable appendix pages.
  const sourceLines = transfer?.schema === 'xpert.content-analysis-transfer@1'
    ? [title, ...transfer.evidence.datasets.flatMap(dataset => [dataset.datasetId,
      ...dataset.rows.flatMap((row, index) => dataset.fields.map(field => `${field.label}: ${String(row[field.id])}${field.unit ? ' ' + field.unit : ''} [${dataset.datasetId}:${index}:${field.id}]`))]),
      '来源与完整性 / Source and completeness', ...rawLines.slice(1, 7),
      ...transfer.evidence.datasets.flatMap(dataset => [dataset.datasetId,
        `完整性 / Completeness: ${dataset.completeness.scope}; ${dataset.completeness.returnedRows} rows; truncated=${dataset.completeness.truncated}; total=${dataset.completeness.totalRows ?? 'unknown'}; accuracy=${dataset.completeness.totalAccuracy}`,
        `Executed: ${dataset.freshness.executedAt}; fetched: ${dataset.freshness.sourceFetchedAt}`,
        ...(dataset.provenance.certification ? [`Certification: ${JSON.stringify(dataset.provenance.certification)}`] : [])]),
      ...transfer.evidence.statements.filter(item => item.kind !== 'fact').map(item => `[${item.kind}] ${item.text}`)]
    : rawLines
  // Conservative visual widths allow for renderer font fallback and narrow hosts.
  const lines = sourceLines.flatMap(line => {
    const chunks: string[] = []
    let current = '', width = 0
    for (const char of Array.from(line)) {
      const weight = char.codePointAt(0)! > 127 ? 2 : 1
      if (width + weight > 54) { chunks.push(current); current = ''; width = 0 }
      current += char; width += weight
    }
    if (current) chunks.push(current)
    return chunks
  }).filter(line => line.trim())
  const pageOrder: string[] = []
  const pages: Record<string, { id: string; title: string; description: string; pageType: number; zIndex: number;
    pageBackgroundFill: { rgb: string }; pageElements: Record<string, { id: string; title: string; description: string; type: number;
      left: number; top: number; width: number; height: number; zIndex: number; richText: { rich: ReturnType<typeof slideText> } }> }> = {}
  for (let offset = 0; offset < lines.length; offset += 10) {
    const pageId = `${id}-page-${pageOrder.length + 1}`, number = pageOrder.length + 1
    const heading = `${title} (${number})`, elementId = `${pageId}-text`
    pageOrder.push(pageId)
    pages[pageId] = { id: pageId, title: heading, description: '', pageType: 0, zIndex: number - 1,
      pageBackgroundFill: { rgb: 'rgb(16,38,58)' }, pageElements: {
        [elementId]: { id: elementId, title: heading, description: '', type: 2, left: 40, top: 40, width: 880, height: 460, zIndex: 22,
          richText: { rich: slideText(elementId, lines.slice(offset, offset + 10)) } }
      } }
  }
  if (pageOrder.length > 100) throw new Error('office.presentation_page_limit')
  return { text: document.text, snapshot: { id, title, pageSize: { width: 960, height: 540 }, body: { pageOrder, pages },
    ...(transfer ? { xpertSource: transfer.source } : {}), ...(document.snapshot.xpertEvidence ? { xpertEvidence: document.snapshot.xpertEvidence } : {}) } }
}

function slideText(id: string, lines: string[]) {
  const text = lines.join('\r') + '\r\n'
  let offset = 0
  return { id, body: { dataStream: text,
    textRuns: [{ st: 0, ed: text.length - 2, ts: { fs: 18, cl: { rgb: 'rgb(243,238,228)' } } }],
    paragraphs: lines.map(line => { offset += line.length; return { startIndex: offset++, paragraphStyle: { spaceAbove: 0, spaceBelow: 0 } } }) },
    documentStyle: { pageSize: { width: 880, height: 460 }, textStyle: { fs: 18 }, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 } }
}
