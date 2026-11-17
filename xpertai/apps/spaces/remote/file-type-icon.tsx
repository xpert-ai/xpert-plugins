// MIME mapping adapted from ChatKit FileTypeIcon (614b5c0); see LICENSE.chatkit-icons.
import React from 'react'
import { fileTypeIcons } from './chatkit-file-icons'

export type ChatKitFileIconType = keyof typeof fileTypeIcons

// Same MIME mapping as ChatKit FileTypeIcon; no filename/title inference.
const mimeIcons: Readonly<Record<string, ChatKitFileIconType>> = {
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'word',
  'application/vnd.oasis.opendocument.text': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.oasis.opendocument.spreadsheet': 'excel',
  'text/csv': 'excel',
  'text/tab-separated-values': 'excel',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'powerpoint',
  'application/vnd.oasis.opendocument.presentation': 'powerpoint',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'text/json': 'json',
  'application/ld+json': 'json',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/plain': 'text',
  'text/html': 'code',
  'text/css': 'code',
  'text/javascript': 'code',
  'application/javascript': 'code',
  'application/typescript': 'code',
  'application/xml': 'code',
  'text/xml': 'code',
  'application/yaml': 'code',
  'application/x-yaml': 'code',
  'text/yaml': 'code',
  'text/x-python': 'code',
  'application/x-python-code': 'code',
  'application/sql': 'code',
  'application/x-sh': 'code',
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/vnd.rar': 'archive',
};

export function getFileIconType(mimeType?: string): ChatKitFileIconType {
  const mime = mimeType?.split(';', 1)[0].trim().toLowerCase()
  if (mime) {
    if (mimeIcons[mime]) return mimeIcons[mime]
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    if (mime.endsWith('+json')) return 'json'
    if (mime.endsWith('+xml')) return 'code'
    if (mime.startsWith('text/')) return 'text'
  }
  return 'file'
}

export function FileTypeIcon({ type = 'file' }: { type?: ChatKitFileIconType }) {
  return <span aria-hidden="true" data-file-type={type} className="inline-flex size-5 shrink-0 items-center justify-center">
    <img src={fileTypeIcons[type]} alt="" width={24} height={24} draggable={false} className="size-full" />
  </span>
}
