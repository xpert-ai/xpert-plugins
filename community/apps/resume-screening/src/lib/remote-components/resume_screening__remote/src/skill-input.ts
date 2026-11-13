/** Preserve skill spelling and internal spaces; deduplicate case-insensitively. */
export function parseSkillInput(value: string): string[] {
  const seen = new Set<string>()
  return value.split(/[,，、\r\n]+/u).map((skill) => skill.trim()).filter((skill) => {
    if (!skill) return false
    const key = skill.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
