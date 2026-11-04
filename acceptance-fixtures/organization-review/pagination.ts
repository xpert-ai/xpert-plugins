/**
 * Preview pagination helper for the isolated Code Review acceptance fixture.
 * Page numbers are one-based. An empty input has zero pages.
 * This fixture is not imported by any application.
 */
export function pageCount(items: readonly unknown[], pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('pageSize must be a positive integer')
  }
  return Math.floor(items.length / pageSize)
}

export function hasNextPage(items: readonly unknown[], pageSize: number, currentPage: number): boolean {
  return currentPage < pageCount(items, pageSize)
}
