import { ZsxqConnectorError } from '../errors.js'

export function parseFirstJson(text: string): unknown {
  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start]
    if (opening !== '{' && opening !== '[') continue
    const closing = opening === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
      const character = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') {
        inString = true
        continue
      }
      if (character === opening) depth += 1
      if (character === closing) depth -= 1
      if (depth !== 0) continue
      const candidate = text.slice(start, index + 1)
      try {
        return JSON.parse(candidate) as unknown
      } catch {
        break
      }
    }
  }
  throw new ZsxqConnectorError('PROVIDER_RESPONSE_INVALID', 'Knowledge Planet CLI did not return valid JSON.')
}
