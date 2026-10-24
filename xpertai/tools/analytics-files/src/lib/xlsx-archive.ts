import { Unzip, UnzipInflate, unzipSync, type UnzipFileInfo } from 'fflate'

const MAX_EXPANDED_BYTES = 40_000_000

// ZIP sizes are untrusted. Count actual output in small chunks before ExcelJS allocates workbook contents.
export function validateXlsxArchive(bytes: Buffer): void {
  const entries = new Map<string, UnzipFileInfo>()
  let declaredBytes = 0
  unzipSync(bytes, { filter(entry) {
    declaredBytes += entry.originalSize
    if (entries.size >= 2000 || declaredBytes > MAX_EXPANDED_BYTES || entries.has(entry.name))
      throw new Error('FILE_DATASET_XLSX_EXPANSION_LIMIT')
    if (/vbaProject|externalLinks/i.test(entry.name)) throw new Error('FILE_DATASET_XLSX_EXTERNAL_CONTENT_DENIED')
    entries.set(entry.name, entry)
    return false
  } })
  if (!entries.has('xl/workbook.xml') || !entries.has('[Content_Types].xml')) throw new Error('FILE_DATASET_XLSX_INVALID')

  const seen = new Set<string>(), completed = new Set<string>()
  let expandedBytes = 0, failure: Error | undefined
  const archive = new Unzip(file => {
    if (failure) return
    const declared = entries.get(file.name)
    if (!declared || seen.has(file.name) || file.compression !== declared.compression ||
      (file.size !== undefined && file.size !== declared.size) ||
      (file.originalSize !== undefined && file.originalSize !== declared.originalSize)) {
      failure = new Error('FILE_DATASET_XLSX_INVALID')
      return
    }
    seen.add(file.name)
    let fileBytes = 0
    file.ondata = (error, chunk, final) => {
      if (failure) return
      if (error) { failure = new Error('FILE_DATASET_XLSX_INVALID'); return }
      fileBytes += chunk.length; expandedBytes += chunk.length
      if (fileBytes > declared.originalSize || expandedBytes > MAX_EXPANDED_BYTES) {
        failure = new Error('FILE_DATASET_XLSX_EXPANSION_LIMIT')
      } else if (final) {
        if (fileBytes !== declared.originalSize) failure = new Error('FILE_DATASET_XLSX_INVALID')
        completed.add(file.name)
      }
    }
    file.start()
  })
  archive.register(UnzipInflate)
  for (let offset = 0; offset < bytes.length && !failure; offset += 1024)
    archive.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
  if (failure) throw failure
  if (completed.size !== entries.size) throw new Error('FILE_DATASET_XLSX_INVALID')
}
