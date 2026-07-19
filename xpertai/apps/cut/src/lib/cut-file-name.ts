const REPLACEMENT_CHARACTER = '\uFFFD'

/**
 * Multipart parsers can expose an UTF-8 filename as Latin-1 mojibake. Prefer the
 * browser-provided name, but repair that legacy representation when it is safe.
 */
export function normalizeCutFileName(value: string | null | undefined, fallback = 'cut-file') {
  const candidate = sanitizeFileName(value?.trim() || fallback)
  const repaired = Buffer.from(candidate, 'latin1').toString('utf8')
  if (!repaired.includes(REPLACEMENT_CHARACTER) && Buffer.from(repaired, 'utf8').toString('latin1') === candidate) {
    return sanitizeFileName(repaired)
  }
  return candidate
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/\0]/g, '_').slice(0, 240) || 'cut-file'
}
