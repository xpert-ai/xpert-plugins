import { i18n } from './i18n'
/** Matches the platform CONTENT_DOCUMENT_LINK_RESOURCE_PARAM contract, never a title or file extension. */
export function linkedDocument(href: string): string | null {
  try {
    const url = new URL(href)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const id = url.searchParams.get('contentResource')
    return id && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(id) ? id : null
  } catch { return null }
}
export function safeHref(value: string) {
  const href = value.trim()
  if (/[\u0000-\u0020]/u.test(href) || !/^(https?:\/\/|mailto:|#)/iu.test(href))
    throw i18n.error('link.invalid')
  return href
}
