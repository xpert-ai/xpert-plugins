/**
 * 纯内容摘要：无 IO、无加密库、无时钟、无随机。
 * 用途：Packet 的默认 id 必须由内容决定 —— 同内容同 id，不同内容不同 id。
 */

// FNV-1a 128 位：比 64 位更能避免内容不同的 Packet 撞号
const FNV_OFFSET = 0x6c62272e07bb014262b821756295c58dn
const FNV_PRIME = 0x0000000001000000000000000000013bn
const MASK = 0xffffffffffffffffffffffffffffffffn

/**
 * 规范化 JSON：对象键排序、数组保序、undefined 视作 null。
 * 保证同一语义对象在不同属性插入顺序下得到同一文本。
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

/** FNV-1a 128 位；返回 32 位十六进制。用于确定性标识，不做安全摘要。 */
export function contentDigest(value: unknown): string {
  const text = canonicalJson(value)
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i))
    hash = (hash * FNV_PRIME) & MASK
  }
  return hash.toString(16).padStart(16, '0')
}
