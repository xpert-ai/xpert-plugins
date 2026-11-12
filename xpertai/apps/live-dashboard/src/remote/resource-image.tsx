import * as React from 'react'
import { z } from 'zod/v3'
import { Image as ImageIcon } from '@xpert-ai/plugin-shadcn-ui'
import type { DirectoryItem } from '../lib/library/directory-contract'
import { libraryAction } from './library-gateway'

/** @beta Reads a resource preview through the host; optional bundled artwork is supplied by the caller. */
export function ResourceImage({ item, fallbackSrc }: { item: DirectoryItem; fallbackSrc?: string }) {
  const [src, setSrc] = React.useState<string>(), [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let alive = true; setSrc(undefined); setFailed(false)
    if (item.releaseId && item.coverAssetId) libraryAction('resource-thumbnail', { releaseId: item.releaseId, assetId: item.coverAssetId },
      z.object({ src: z.string().regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,/) })).then(result => { if (alive) setSrc(result.src) }, () => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [item.releaseId, item.coverAssetId])
  const image = src ?? fallbackSrc
  return image && !failed ? <img className="aspect-video w-full object-cover" width="578" height="324" alt={item.title} src={image} loading="lazy" onError={() => setFailed(true)}/>
    : <div className="flex aspect-video items-center justify-center bg-muted/40"><ImageIcon className="size-10 text-muted-foreground" aria-hidden="true"/></div>
}
