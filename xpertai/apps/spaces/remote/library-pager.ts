export type LibraryPage<T> = { items: T[]; hasMore: boolean; nextCursor?: string }
type Stream<T> = { read: (cursor?: string) => Promise<LibraryPage<T>>; buffer: T[]; cursor?: string; ended: boolean }

/** Merge sorted server pages before exposing a batch. Fetch an exhausted stream
 * before taking the next item, otherwise an old row can precede an unseen newer row. */
export class LibraryPager<T> {
  private streams: Stream<T>[]
  private pending: Promise<void> = Promise.resolve()
  constructor(readers: Array<(cursor?: string) => Promise<LibraryPage<T>>>, private compare: (a: T, b: T) => number) {
    this.streams = readers.map(read => ({ read, buffer: [], ended: false }))
  }
  next(size = 50): Promise<{ items: T[]; hasMore: boolean }> {
    const result = this.pending.then(() => this.readNext(size))
    this.pending = result.then(() => undefined, () => undefined)
    return result
  }
  private async readNext(size: number): Promise<{ items: T[]; hasMore: boolean }> {
    // Commit cursor consumption only after the whole visible page succeeds. A
    // failed refill (including a late sibling response) must not consume rows.
    const streams = this.streams.map(stream => ({ ...stream, buffer: [...stream.buffer] }))
    const items: T[] = []
    while (items.length < size) {
      await Promise.all(streams.filter(stream => !stream.buffer.length && !stream.ended).map(async stream => {
        const page = await stream.read(stream.cursor)
        if (page.hasMore && (!page.nextCursor || page.nextCursor === stream.cursor)) throw new Error('spaces.invalid_cursor')
        stream.buffer = page.items; stream.ended = !page.hasMore; stream.cursor = page.nextCursor
      }))
      const next = streams.filter(stream => stream.buffer.length).sort((a, b) => this.compare(a.buffer[0], b.buffer[0]))[0]
      if (!next) break
      items.push(next.buffer.shift()!)
    }
    this.streams = streams
    return { items, hasMore: streams.some(stream => stream.buffer.length || !stream.ended) }
  }
}
