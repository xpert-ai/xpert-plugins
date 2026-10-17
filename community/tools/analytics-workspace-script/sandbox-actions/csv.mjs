/** RFC 4180 text adapter owned by the script plugin; returns records with original headers. */
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '')
  if (!text) return []
  const records = [], row = []
  let field = '', quoted = false, closed = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else field += char
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false
      if (char !== ',') {
        records.push([...row]); row.length = 0
        if (char === '\r' && text[i + 1] === '\n') i++
      }
    } else if (char === '"' && !field && !closed) quoted = true
    else {
      if (closed || char === '"') throw new Error('CSV quoting is invalid')
      field += char
    }
  }
  if (quoted) throw new Error('CSV quote is not closed')
  if (row.length || field || closed) { row.push(field); records.push(row) }
  const headers = records.shift()
  if (!headers?.length || headers.some(key => !key) || new Set(headers).size !== headers.length) throw new Error('CSV headers must be nonempty and unique')
  return records.map(values => {
    if (values.length !== headers.length) throw new Error('CSV row length does not match headers')
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]))
  })
}
