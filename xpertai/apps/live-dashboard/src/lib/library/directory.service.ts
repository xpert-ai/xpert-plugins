import { Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { LibraryCatalogService, versionItem } from './catalog.service'
import { directoryQuerySchema, directoryPageSchema, type DirectoryItem } from './directory-contract'

const metadata = z.object({ presentation: z.object({ coverAssetId: z.string().optional() }).optional(),
  taskData: z.object({ mode: z.enum(['demo','web','external']), tools: z.array(z.string()) }).optional(),
  translations: z.record(z.object({ title: z.string(), description: z.string() })).optional() })

/** @beta Localized, paged display projection of persisted resource versions; contracts may change incompatibly. */
@Injectable()
export class LibraryDirectoryService {
  constructor(private readonly catalog: LibraryCatalogService) {}
  async list(context: XpertResolvedViewHostContext, input: z.input<typeof directoryQuerySchema>) {
    const query = directoryQuerySchema.parse(input)
    const page = await this.catalog.list(context, { ...query, category: query.category || undefined })
    return directoryPageSchema.parse({ ...page, items: page.items.map(row => this.item(row, query.locale)) })
  }
  private item(row: ReturnType<typeof versionItem>, locale: string): DirectoryItem {
    const details = metadata.parse(row), text = details.translations?.[locale]
    return { id: row.releaseId, releaseId: row.releaseId, kind: row.kind, title: text?.title ?? row.title,
      description: text?.description ?? row.description, categories: row.categories, version: row.version, state: 'released',
      features: [], requirements: details.taskData?.tools ?? [], ...(details.taskData ? { dataMode: details.taskData.mode } : {}), ...(details.presentation?.coverAssetId ? { coverAssetId: details.presentation.coverAssetId } : {}) }
  }
}
