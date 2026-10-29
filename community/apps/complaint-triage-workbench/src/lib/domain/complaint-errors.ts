export function safeComplaintErrorMessage(value: string) {
  const normalized = value
    .trim()
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/(["']?(?:api[_-]?key|(?:access[_-]?|refresh[_-]?)?token|secret|password)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
  return normalized || 'Complaint analysis failed. Please retry.'
}
