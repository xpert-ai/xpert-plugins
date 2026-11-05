/** Drain every started task before returning; never exceed the worker budget on rejection. */
export async function boundedMap<T, R>(items: readonly T[], run: (item: T, index: number) => Promise<R>, concurrency = 4): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0, failed = false, failure: unknown
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.min(8, concurrency)), items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++
      try { results[index] = await run(items[index], index) }
      catch (error) { if (!failed) { failed = true; failure = error } }
    }
  }))
  if (failed) throw failure
  return results
}
