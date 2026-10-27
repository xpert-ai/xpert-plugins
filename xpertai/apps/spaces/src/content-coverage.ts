import type { ContentCatalogItem } from '@xpert-ai/contracts'
export type ContentPathCoverage = { path: string; recursive: boolean }

/** The native provider declares coverage. Never infer ownership from type names,
 * file extensions or plugin-specific folder conventions in the generic library. */
export function contentCoverage(items: ContentCatalogItem[]): ContentPathCoverage[] {
  return items.flatMap(item => [
    ...(item.containedPaths ?? []),
    ...(item.source.kind === 'bundle' ? [{ path: item.source.rootPath, recursive: true }] :
      item.source.kind === 'file' ? [{ path: item.source.path, recursive: false }] : [])
  ])
}
export function coveredByContent(path: string, coverage: ContentPathCoverage[]) {
  return coverage.some(entry => path === entry.path || entry.recursive && path.startsWith(`${entry.path}/`))
}
