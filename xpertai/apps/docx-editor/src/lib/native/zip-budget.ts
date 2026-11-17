/** Bound inflated sizes before JSZip can allocate attacker-controlled decompressed entries. */
export function validateZipBudget(buffer: Buffer) {
  let end = -1
  for (let n = buffer.length - 22; n >= Math.max(0, buffer.length - 65557); n--) {
    if (buffer.readUInt32LE(n) === 0x06054b50 && n + 22 + buffer.readUInt16LE(n + 20) === buffer.length) { end = n; break }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new Error('invalid_zip')
  const count = buffer.readUInt16LE(end + 10)
  if (!count || count > 10000) throw new Error('entry_limit')
  let offset = buffer.readUInt32LE(end + 16), total = 0
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('invalid_directory')
    const size = buffer.readUInt32LE(offset + 24)
    total += size
    if (size > 50 * 1024 * 1024 || total > 200 * 1024 * 1024) throw new Error('expanded_size_limit')
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
  if (offset > end) throw new Error('invalid_directory')
  return total
}
