export interface Sentence {
  id: string
  text: string
}

const MAX_SENTENCES = 60

// The model cites evidence by sentence id and the server restores the quote from its own copy of the
// complaint, so a quote can never be invented or altered. The split must therefore be deterministic:
// the same content always yields the same ids.
export function splitSentences(content: string): Sentence[] {
  const parts = content
    .replace(/\r\n?/g, '\n')
    .split(/(?<=[。！？!?；;])|(?<=\.)\s+|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  // Keep the id space small for very long complaints: the tail is merged into the last sentence.
  const bounded =
    parts.length > MAX_SENTENCES
      ? [...parts.slice(0, MAX_SENTENCES - 1), parts.slice(MAX_SENTENCES - 1).join(' ')]
      : parts

  return bounded.map((text, index) => ({ id: `s${index + 1}`, text }))
}
