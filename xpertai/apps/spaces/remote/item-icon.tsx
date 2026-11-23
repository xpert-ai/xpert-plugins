import React from 'react'
import type { IconDefinition } from '@xpert-ai/contracts'
import { Folder, ChartNoAxesCombined } from '@xpert-ai/plugin-shadcn-ui'
import { FileTypeIcon, getFileIconType, type ChatKitFileIconType } from './file-type-icon'
import type { Item } from './model'

export function TypeIcon({ icon, fallback = <FileTypeIcon /> }: { icon?: IconDefinition; fallback?: React.ReactNode }) {
  if (icon?.type === 'svg' && icon.value.includes('currentColor')) return <span className="inline-block size-5 shrink-0" aria-hidden="true" style={{ backgroundColor: 'currentColor', mask: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.value)}") center / contain no-repeat` }} />
  if (icon?.type === 'svg') return <img className="size-5 shrink-0" alt="" aria-hidden="true" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.value)}`} />
  if (icon?.type === 'image' && /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]|\/(?!\/))/i.test(icon.value))
    return <img className="size-5 shrink-0 object-contain" alt="" aria-hidden="true" src={icon.value} />
  if (icon?.type === 'emoji') return <span className="inline-flex size-5 shrink-0 items-center justify-center" aria-hidden="true">{icon.value}</span>
  return <>{fallback}</>
}
export function ItemIcon({ item }: { item: Pick<Item, 'kind' | 'icon' | 'mimeType' | 'presentation' | 'resourceTypeId'> }) {
  if (item.kind === 'folder') return <Folder aria-hidden="true" />
  const mimeIcon = getFileIconType(item.mimeType)
  const family = item.presentation?.artifactKind
  const documentType = mimeIcon !== 'file' ? mimeIcon : family ? artifactIcons[family] :
    item.kind === 'page' ? 'markdown' : contentIcons[item.resourceTypeId ?? '']
  // Document formats always use the ChatKit artwork, including when a provider supplies another icon.
  if (documentType && documentType !== 'file')
    return <FileTypeIcon type={documentType} />
  return <ResourceTypeIcon typeId={item.resourceTypeId ?? ''} icon={item.presentation?.type?.icon ?? item.icon} />
}

// Stable semantic IDs declared by installed content providers, never localized labels or filenames.
const contentIcons: Readonly<Record<string, ChatKitFileIconType | undefined>> = {
  document: 'text', presentation: 'powerpoint', 'xpert.presentation': 'powerpoint',
  'xpert.spreadsheet': 'excel', video: 'video'
}
const artifactIcons: Record<NonNullable<NonNullable<Item['presentation']>['artifactKind']>, ChatKitFileIconType> = {
  html: 'code', markdown: 'markdown', pdf: 'pdf', pptx: 'powerpoint', image: 'image',
  file: 'file', site: 'web', presentation: 'powerpoint'
}
export function ResourceTypeIcon({ typeId, icon }: { typeId: string; icon?: IconDefinition }) {
  const type = contentIcons[typeId]
  if (type) return <FileTypeIcon type={type} />
  return <TypeIcon icon={icon} fallback={typeId === 'xpert.live-dashboard' ? <ChartNoAxesCombined aria-hidden="true" /> : <FileTypeIcon />} />
}
