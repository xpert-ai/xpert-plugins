import { createHash } from 'node:crypto'
import type { AnalysisEvidenceSnapshot } from '@xpert-ai/contracts'
import { analysisEvidenceDigestInput, parseAnalysisEvidence } from '@xpert-ai/plugin-sdk/analytics'
import { validateHyperframesComposition } from '../hyperframes-composition.js'
const html = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/** Fixed observations only: no aggregation, rounding, live queries, remote assets or generated claims. */
export function evidenceComposition(input: AnalysisEvidenceSnapshot) {
  const evidence = parseAnalysisEvidence(input)
  if (createHash('sha256').update(analysisEvidenceDigestInput(evidence)).digest('hex') !== evidence.sha256)
    throw new Error('MOTION_EVIDENCE_INTEGRITY_FAILED')
  const first = evidence.datasets[0], fields = first.fields.slice(0, 4), rows = first.rows.slice(0, 6)
  const captions = rows.map((row, index) => ({ start: 3 + index, duration: 1,
    text: fields.map(field => `${field.label}: ${String(row[field.id])}${field.unit ? ' ' + field.unit : ''}`).join('; '),
    citations: fields.map(field => ({ datasetId: first.datasetId, row: index, field: field.id })) }))
  const metadata = JSON.stringify({ schema: 'xpert.evidence-narration@1', evidenceId: evidence.id, sha256: evidence.sha256,
    audio: 'not_generated', captions }).replace(/</g, '\\u003c')
  const composition = `<!doctype html><html><head><meta charset="utf-8"><title>${html(evidence.title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#10263a;color:#f3eee4;font-family:Arial,sans-serif}main{position:relative;overflow:hidden;width:1280px;height:720px}.scene{position:absolute;inset:0;padding:72px;background:#10263a;display:flex;flex-direction:column;justify-content:center}h1{font-size:60px;margin:24px 0;line-height:1.15;overflow-wrap:anywhere}h2{font-size:38px;margin:0 0 28px}.label{color:#b89960;font-size:20px;letter-spacing:.06em}.meta{font-size:20px;line-height:1.6;overflow-wrap:anywhere;max-height:180px;overflow:hidden}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:14px 12px;border-bottom:1px solid #526271;text-align:left;font-size:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}th{color:#b89960;font-size:18px}.note{margin-top:24px;font-size:17px;color:#c2cbd1}.hash{font-family:monospace;font-size:19px;overflow-wrap:anywhere}.caption{position:absolute;bottom:35px;left:72px;right:72px;font-size:20px;background:#10263a;padding:10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.scene,.caption{opacity:0;visibility:hidden;animation:evidence-window var(--window-duration,3s) linear both}
@keyframes evidence-window{0%{opacity:0;visibility:hidden}1%,99%{opacity:1;visibility:visible}100%{opacity:0;visibility:hidden}}
</style></head><body><main data-composition-id="evidence" data-width="1280" data-height="720" data-duration="12" data-no-timeline>
<section class="scene" data-scene-title="Analysis snapshot" data-hf-id="intro" data-start="0" data-duration="3"><div class="label">分析快照 / ANALYSIS SNAPSHOT</div><h1>${html(evidence.title)}</h1><p class="meta">${html(evidence.capturedAt)}<br>来源版本 / Source version: ${html(evidence.source.versionId)}</p></section>
<section class="scene" style="--window-duration:6s" data-scene-title="Fixed results" data-hf-id="data" data-start="3" data-duration="6"><h2>${html(first.datasetId)}</h2><table><thead><tr>${fields.map(field => `<th>${html(field.label)}${field.unit ? ' (' + html(field.unit) + ')' : ''}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr>${fields.map(field => `<td data-evidence-cell="${html(first.datasetId)}:${index}:${html(field.id)}">${html(row[field.id])}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="note">显示 / Showing ${rows.length} of ${first.rows.length} rows, ${fields.length} of ${first.fields.length} fields · ${html(first.completeness.scope)} · truncated=${first.completeness.truncated}</p></section>
${captions.map((caption, index) => `<div class="caption" style="--window-duration:1s" data-hf-id="caption-${index}" data-start="${caption.start}" data-duration="${caption.duration}">${html(caption.text)}</div>`).join('')}
<section class="scene" data-scene-title="Traceable evidence" data-hf-id="provenance" data-start="9" data-duration="3"><div class="label">可追溯证据 / TRACEABLE EVIDENCE</div><h2>固定快照 · 不随刷新变化<br>Fixed snapshot</h2><p class="meta">${html(evidence.id)}<br>Executed: ${html(first.freshness.executedAt)}<br>Fetched: ${html(first.freshness.sourceFetchedAt)}</p><p class="hash">SHA-256: ${html(evidence.sha256)}</p><p class="note">认证仅描述快照时状态。此初稿未生成配音。<br>Certification describes capture time. This draft has no generated voice-over.</p></section>
</main><script type="application/json" id="evidence-narration">${metadata}</script></body></html>`
  return { html: validateHyperframesComposition(composition), captions }
}
