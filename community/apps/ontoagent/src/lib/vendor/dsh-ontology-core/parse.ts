/**
 * 文本 → Delta 解析（docs/05 登记的风险：宿主可能在 answer 前加装饰前缀）。
 * 策略：先剥已知前缀 → 再取 JSON 块 → 结构校验；失败即显式原因，不静默兜底。
 * 放在 core 是因为**产线（pipeline）与适配器（adapter）都要用**，两份实现必然漂移。
 */
import type { Assertion, Delta, Op } from './types.js'

export type ParseOutcome =
  | { ok: true; delta: Delta }
  | { ok: false; reason: 'no_json' | 'bad_json' | 'bad_shape'; detail: string }

const KNOWN_PREFIXES = [/^\[已终止[^\]]*\]\s*/, /^\[truncated[^\]]*\]\s*/i]

export function stripDecoration(text: string): string {
  let out = text.trim()
  for (const re of KNOWN_PREFIXES) out = out.replace(re, '')
  return out.trim()
}

function extractJson(text: string): string | null {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  return text.slice(first, last + 1)
}

const OP_KINDS = new Set(['assert', 'retract', 'restrict', 'alias', 'map', 'merge_node', 'split_node'])

export function parseDelta(text: string): ParseOutcome {
  const cleaned = stripDecoration(text)
  const raw = extractJson(cleaned)
  if (raw === null) return { ok: false, reason: 'no_json', detail: '未找到 JSON 对象' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ok: false, reason: 'bad_json', detail: String((err as Error)?.message ?? err) }
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj !== 'object' || obj === null) return { ok: false, reason: 'bad_shape', detail: '不是对象' }
  const deltaId = typeof obj.deltaId === 'string' ? obj.deltaId : typeof obj.delta_id === 'string' ? obj.delta_id : null
  if (deltaId === null) return { ok: false, reason: 'bad_shape', detail: '缺 deltaId' }

  const bvRaw = obj.baseVersion ?? obj.base_version
  const hash = (bvRaw as { hash?: unknown } | undefined)?.hash
  if (typeof hash !== 'string' || hash.length === 0) {
    return { ok: false, reason: 'bad_shape', detail: '缺 baseVersion.hash（OA5：不带版本的增量一律拒绝）' }
  }
  const opsRaw = obj.ops
  if (!Array.isArray(opsRaw)) return { ok: false, reason: 'bad_shape', detail: '缺 ops 数组' }
  const ops: Op[] = []
  for (const item of opsRaw) {
    const op = item as { op?: unknown; assertion?: unknown }
    if (typeof op.op !== 'string' || !OP_KINDS.has(op.op)) {
      return { ok: false, reason: 'bad_shape', detail: '非法 op：' + String(op.op) }
    }
    if (op.op === 'assert') {
      const a = op.assertion as Partial<Assertion> | undefined
      if (a === undefined || typeof a.id !== 'string' || typeof a.s !== 'string' || typeof a.p !== 'string') {
        return { ok: false, reason: 'bad_shape', detail: 'assert 缺 id/s/p' }
      }
      // 注意：OA2（只能是 candidate）由**闸门**执法，不在这里 —— 闸门能给出原因码与目标 id，
      // 解析器只负责结构。两处都拒会让诊断信息退化。
    }
    ops.push(item as Op)
  }
  return { ok: true, delta: { deltaId, baseVersion: { hash }, ops } }
}
