// Reuse successful static resource bytes only within one validation. Every request
// still passes the document resource policy; redirects are never fetched out of band.
export function createResourceCache() {
  const admitted = new WeakSet(), entries = new Map()
  const maxResourceBytes = 8 * 1024 * 1024, maxTotalBytes = 32 * 1024 * 1024
  let totalBytes = 0
  const key = request => `${request.resourceType()}:${request.url().split('#')[0]}`
  return {
    async route(page, route) {
      const request = route.request()
      const allowed = request.method() === 'GET' && await page.evaluate(({ type, url }) =>
        DocumentHost.isDashboardResourceAllowed(type, url), { type: request.resourceType(), url: request.url() })
      if (!allowed) return route.abort('blockedbyclient')
      admitted.add(request)
      const cached = await entries.get(key(request))
      if (cached) return route.fulfill(cached)
      return route.continue()
    },
    capture(response) {
      const request = response.request(), id = key(request), headers = response.headers()
      if (!admitted.has(request) || response.status() !== 200 || entries.has(id) || entries.size >= 128 ||
          headers['set-cookie'] || /(?:^|,)\s*no-store(?:,|$)/i.test(headers['cache-control'] ?? '') ||
          headers.vary === '*' || Number(headers['content-length']) > maxResourceBytes) return
      const pending = (async () => {
        try {
          const body = await response.body()
          if (body.length > maxResourceBytes || totalBytes + body.length > maxTotalBytes) return
          totalBytes += body.length
          // Playwright exposes decoded bytes; do not replay wire compression/length.
          const replayHeaders = { ...headers }
          for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete replayHeaders[name]
          return { status: 200, headers: replayHeaders, body }
        } catch { return undefined } // A failed load is reported by the page, never cached.
      })()
      entries.set(id, pending)
    },
    async settle() { await Promise.all(entries.values()) }
  }
}
