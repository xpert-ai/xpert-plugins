type JsonInputField = 'requestJson' | 'binding.payloadJson' | 'bindingJson'

/** Report syntax locations without echoing query text or native errors containing input fragments. */
export function parseJsonInput(text: string, field: JsonInputField): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    const match = /\bat position (\d+)(?: \(line \d+ column \d+\))?$/.exec(error.message)
    const offset = match ? Number(match[1]) : error.message === 'Unexpected end of JSON input' ? text.length : undefined
    if (offset === undefined || offset > text.length) {
      throw new Error(`DASHBOARD_INVALID_JSON: ${field} contains invalid JSON; the parser did not provide a character position. Supply one complete JSON object without Markdown fences.`)
    }
    const lines = text.slice(0, offset).split(/\r\n|\r|\n/)
    const character = offset === text.length ? 'end of input' : JSON.stringify(String.fromCodePoint(text.codePointAt(offset)!))
    throw new Error(`DASHBOARD_INVALID_JSON: ${field} has invalid JSON at offset ${offset} (0-based UTF-16), line ${lines.length}, column ${lines.at(-1)!.length + 1} (1-based); found ${character}. Check this position and the preceding JSON delimiter or value.`)
  }
}
