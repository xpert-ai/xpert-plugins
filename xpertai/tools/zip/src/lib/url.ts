export function ensureDirectoryUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) {
    throw new Error('Workspace URL is not available')
  }

  const url = new URL(rawUrl)
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url.href
}
