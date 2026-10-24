import { t, useLocale } from './i18n'
import React from 'react'
import ReactMarkdown from 'react-markdown'

/** Read-only rendering never executes embedded HTML or loads remote document images. */
export function MarkdownText({ children }: { children: string }) {
  useLocale()
  return <div className="markdown-text"><ReactMarkdown skipHtml components={{
    img: ({ alt }) => <span className="muted">{alt || t('common.image')}</span>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  }}>{children}</ReactMarkdown></div>
}
