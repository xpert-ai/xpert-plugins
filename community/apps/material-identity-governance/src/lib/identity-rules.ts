import { createHash } from 'node:crypto'
import type {
  Attribute,
  Candidate,
  Difference,
  GovernanceCase,
  SourceMaterial,
} from './contracts.js'
export function normalizeAttribute(a: Attribute): Attribute {
  if (a.unit === 'm' && Number.isFinite(Number(a.value)))
    return { ...a, value: String(Number(a.value) * 1000), unit: 'mm' }
  if (a.unit === 'cm' && Number.isFinite(Number(a.value)))
    return { ...a, value: String(Number(a.value) * 10), unit: 'mm' }
  const aliases: Record<string, string> = {
    SUS304: '304',
    'AISI 304': '304',
    铬轴承钢: 'GCr15',
  }
  return {
    ...a,
    value: aliases[a.value.trim()] ?? a.value.trim(),
    unit: a.unit === '毫米' ? 'mm' : a.unit,
  }
}
export function compareMaterial(
  source: SourceMaterial,
  candidate: SourceMaterial,
): Candidate {
  const left = source.attributes.map(normalizeAttribute),
    right = candidate.attributes.map(normalizeAttribute)
  const required: Record<string, readonly string[]> = {
    bearing: ['material', 'bore', 'outer', 'width', 'precision', 'seal'],
    bracket: ['material', 'thickness', 'hole'],
    spacer: ['material', 'bore', 'outer', 'length', 'hardness'],
  }
  const keys = [
    ...new Set([
      ...(required[source.category] ?? ['material']),
      ...left.map((a) => a.key),
      ...right.map((a) => a.key),
    ]),
  ]
  const differences: Difference[] = keys.map((key) => {
    const a = left.find((x) => x.key === key),
      b = right.find((x) => x.key === key)
    const present = Boolean(a?.value && b?.value)
    return {
      key,
      label: a?.label ?? b?.label ?? key,
      source: a ? a.value + (a.unit ?? '') : '',
      candidate: b ? b.value + (b.unit ?? '') : '',
      result: !present
        ? 'missing'
        : a!.value === b!.value && a!.unit === b!.unit
          ? 'match'
          : 'conflict',
      critical:
        (required[source.category] ?? ['material']).includes(key) ||
        a?.critical === true ||
        b?.critical === true,
    }
  })
  differences.push({
    key: 'drawing',
    label: '图号',
    source: source.drawing,
    candidate: candidate.drawing,
    result:
      !source.drawing || !candidate.drawing
        ? 'missing'
        : source.drawing === candidate.drawing
          ? 'match'
          : 'conflict',
    critical: true,
  })
  differences.push({
    key: 'revision',
    label: '图纸版本',
    source: source.revision,
    candidate: candidate.revision,
    result:
      !source.revision || !candidate.revision
        ? 'missing'
        : source.revision === candidate.revision
          ? 'match'
          : 'conflict',
    critical: true,
  })
  const hardFilterPassed =
    source.category === candidate.category &&
    differences.every((d) => !d.critical || d.result === 'match')
  const score =
    differences.filter((d) => d.result === 'match').length / differences.length
  return {
    id: candidate.id,
    code: candidate.code,
    name: candidate.name,
    relation: hardFilterPassed
      ? 'same_identity'
      : differences.some((d) => d.critical && d.result === 'missing')
        ? 'uncertain'
        : 'different',
    score,
    hardFilterPassed,
    differences,
    evidenceIds: [
      ...source.attributes.flatMap((a) => a.evidenceIds),
      ...candidate.attributes.flatMap((a) => a.evidenceIds),
    ],
    rationale:
      !hardFilterPassed &&
      differences.some((d) => d.critical && d.result === 'missing')
        ? '关键技术属性或图纸证据缺失，无法确认同一物料；需补充后重新治理。'
        : hardFilterPassed
          ? '关键规格、图号和版本一致；工厂编码和采购描述差异不改变物料身份。'
          : '关键属性存在不可兼容差异，不能以名称相同或相似度高为由合并。',
  }
}
export function assertEvidence(current: GovernanceCase, ids: string[]) {
  const allowed = new Set(current.evidence.map((e) => e.id))
  if (!ids.length || ids.some((id) => !allowed.has(id)))
    throw new Error('invalid_evidence_reference')
}

export function materialFingerprint(material: SourceMaterial): string {
  if (!compareMaterial(material, material).hardFilterPassed)
    throw new Error('identity_evidence_incomplete')
  const attributes = material.attributes
    .map(normalizeAttribute)
    .filter((a) => a.critical)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((a) => [a.key, a.value, a.unit])
  return createHash('sha256')
    .update(
      JSON.stringify([
        material.category,
        material.drawing,
        material.revision,
        attributes,
      ]),
    )
    .digest('hex')
}
export const goldenIdentity = (material: SourceMaterial) =>
  `GMI-${materialFingerprint(material).slice(0, 16).toUpperCase()}`
