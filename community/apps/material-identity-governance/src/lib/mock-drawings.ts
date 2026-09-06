import { createHash } from 'node:crypto'
import type { SourceMaterial, DrawingDocument } from './contracts.js'
const xml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
/** Programmatic PLM fixture: a visible drawing and its machine-readable released annotations. */
export function createMockDrawing(material: SourceMaterial): DrawingDocument {
  const body =
    material.category === 'bracket'
      ? '<path d="M230 160h300v150H350v-70H230Z"/><circle cx="275" cy="198" r="14"/><circle cx="480" cy="198" r="14"/><path d="M350 240h180"/>'
      : material.category === 'bearing'
        ? '<circle cx="370" cy="215" r="100"/><circle cx="370" cy="215" r="72"/><circle cx="370" cy="215" r="42"/><path d="M245 215h250M370 90v250" stroke-dasharray="9 6"/>'
        : '<path d="M260 145h250v140H260Z M260 180h250 M260 250h250"/><ellipse cx="260" cy="215" rx="32" ry="70"/><ellipse cx="510" cy="215" rx="32" ry="70"/><path d="M220 215h335" stroke-dasharray="9 6"/>'
  const metadata = material.attributes
    .map(
      (a) =>
        `<attribute key="${xml(a.key)}" value="${xml(a.value)}" unit="${xml(a.unit ?? '')}"/>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><metadata id="mock-plm-annotations">${metadata}</metadata><rect width="960" height="640" fill="#fff"/><g fill="none" stroke="#27364b" stroke-width="2"><rect x="24" y="24" width="912" height="592"/>${body}<path d="M210 350h340M230 335v30M530 335v30M210 125v190M195 145h30M195 285h30"/></g><g fill="#1c2b40" font-family="Arial,Microsoft YaHei,sans-serif"><text x="48" y="60" font-size="22">汽车零部件 · 研发发布图纸（Mock PLM）</text><text x="48" y="88" font-size="14">${xml(material.name)} · ${xml(material.plant)}</text>${material.attributes.map((a, i) => `<text x="620" y="${145 + i * 30}" font-size="17">${xml(a.label)}：${xml(a.value)} ${xml(a.unit ?? '')}</text>`).join('')}<text x="280" y="385" font-size="14">示意投影 · 关键尺寸以右侧发布标注为准</text><text x="48" y="464" font-size="16">来源部门：研发设计中心　状态：已发布　用途：物料身份治理演示</text><text x="48" y="498" font-size="16">图号：${xml(material.drawing)}　版本：${xml(material.revision)}　编号：${xml(material.id)}</text><text x="48" y="536" font-size="14">识别方式：读取图纸内嵌的结构化标注，并保留字段来源证据。</text><text x="48" y="568" font-size="14">这是程序生成的模拟研发图纸，不可用于生产加工。</text></g></svg>`
  return {
    id: `drawing-${material.id}`,
    sourceId: material.id,
    title: `${material.drawing} / ${material.revision}`,
    mediaType: 'image/svg+xml',
    content: svg,
    sha256: createHash('sha256').update(svg).digest('hex'),
  }
}
export function extractMockDrawing(document: DrawingDocument) {
  if (
    createHash('sha256').update(document.content).digest('hex') !==
    document.sha256
  )
    throw new Error('drawing_snapshot_tampered')
  const match = document.content.match(
    /<metadata id="mock-plm-annotations">([\s\S]*?)<\/metadata>/,
  )
  if (!match) throw new Error('drawing_annotations_missing')
  const decode = (s: string) =>
    s
      .replaceAll('&quot;', '"')
      .replaceAll('&gt;', '>')
      .replaceAll('&lt;', '<')
      .replaceAll('&amp;', '&')
  return [
    ...match[1]!.matchAll(
      /<attribute key="([^"]+)" value="([^"]+)" unit="([^"]*)"\/>/g,
    ),
  ].map((m) => ({
    key: decode(m[1]!),
    value: decode(m[2]!),
    unit: decode(m[3]!) || null,
  }))
}
