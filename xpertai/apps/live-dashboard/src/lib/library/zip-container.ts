import { Unzip, UnzipInflate } from 'fflate'

export type ZipPolicy = { entries: number; entryBytes: number; totalBytes: number; name: RegExp; ratio?: number }
const fail = (): never => { throw new Error('LIBRARY_ARCHIVE_ENTRY_INVALID') }

/** Check central and local headers together; neither names nor declared sizes alone are trusted. */
export function validateZipDirectory(bytes: Buffer, policy: ZipPolicy) {
  const end = bytes.length - 22
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20)) fail()
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12)
  if (count !== bytes.readUInt16LE(end + 8) || !count || count > policy.entries || start + size !== end) fail()
  const names = new Set<string>(); let offset = start, lastEnd = 0, total = 0
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail()
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), compressed = bytes.readUInt32LE(offset + 20), inflated = bytes.readUInt32LE(offset + 24),
      length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42), mode = bytes.readUInt32LE(offset + 38) >>> 16
    total += inflated
    if (flags & 1 || ![0, 8].includes(method) || inflated > policy.entryBytes || total > policy.totalBytes ||
      (policy.ratio && inflated > Math.max(compressed, 1) * policy.ratio) || (mode & 0xf000) === 0xa000 || offset + 46 + length + extra + comment > end) fail()
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8')
    if (names.has(name) || !policy.name.test(name) || local < lastEnd || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) fail()
    names.add(name)
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), body = local + 30 + localName + localExtra
    if (bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || body + compressed > start || bytes.subarray(local + 30, local + 30 + localName).toString('utf8') !== name) fail()
    lastEnd = body + compressed; offset += 46 + length + extra + comment
  }
  if (offset !== end) fail()
}

export function readZipFiles(bytes: Buffer, policy: ZipPolicy): Map<string, Buffer> {
  validateZipDirectory(bytes, policy)
  const files = new Map<string, Buffer>(), seen = new Set<string>()
  let total = 0, active = 0, error: Error | undefined
  const unzip = new Unzip(file => {
    if (!policy.name.test(file.name) || seen.has(file.name) || seen.size >= policy.entries) fail()
    seen.add(file.name); active++
    const chunks: Uint8Array[] = []; let size = 0
    file.ondata = (err, data, final) => {
      if (err) { error = err; file.terminate(); return }
      size += data.length; total += data.length
      if (size > policy.entryBytes || total > policy.totalBytes) { error = new Error('LIBRARY_ARCHIVE_LIMIT'); file.terminate(); return }
      chunks.push(data)
      if (final) { files.set(file.name, Buffer.concat(chunks)); active-- }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let i = 0; i < bytes.length; i += 1024) {
    unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length)
    if (error) throw error
  }
  if (active || files.size !== seen.size) fail()
  return files
}
