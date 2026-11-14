export function sourcePage(path: string, sha: string, content: string, offset: number, limit: number) {
  const lines = content.split('\n')
  return { path, sha, offset, total: lines.length, content: lines.slice(offset, offset + limit).map((line, i) => `${offset + i + 1}: ${line}`).join('\n') }
}
