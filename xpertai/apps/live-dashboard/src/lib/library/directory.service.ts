import { Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import blueprints from './catalog-blueprints.json'
import { LibraryCatalogService, versionItem } from './catalog.service'
import { directoryQuerySchema, directoryPageSchema, type DirectoryItem } from './directory-contract'

const metadata = z.object({ presentation: z.object({ coverAssetId: z.string().optional() }).optional(),
  taskData: z.object({ mode: z.enum(['demo','web','external']), tools: z.array(z.string()) }).optional(),
  translations: z.record(z.object({ title: z.string(), description: z.string() })).optional() })

/** @beta Display-only blueprints are not releases or official certification. Uploaded data lives exclusively in V2. */
@Injectable()
export class LibraryDirectoryService {
  constructor(private readonly catalog: LibraryCatalogService) {}
  async list(context: XpertResolvedViewHostContext, input: z.input<typeof directoryQuerySchema>) {
    const query = directoryQuerySchema.parse(input)
    await this.catalog.actor(context)
    if (query.audience !== 'catalog') {
      const page = await this.catalog.list(context, { ...query, category: query.category || undefined,
        // Directory-only filters never leak into the canonical resource query.
        appearance: query.appearance, locale: query.locale, audience: query.audience })
      return directoryPageSchema.parse({ ...page, items: page.items.map(row => this.item(row, query.locale)) })
    }
    // This bounded metadata set contains no dataset rows, prompts or runnable template definitions.
    const filtered = blueprints.filter(item => item.kind === query.kind && (!query.category || item.categories.includes(query.category))
      && (query.appearance === 'all' || 'appearance' in item && item.appearance === query.appearance)
      && (!query.search || [item.translations[query.locale].title, item.translations[query.locale].description,
        ...item.translations[query.locale].features].join(' ').toLocaleLowerCase().includes(query.search.trim().toLocaleLowerCase())))
    const page = filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    const rows = page.length ? await this.catalog.matchOwned(context, page.map(item => ({ logicalId: item.logicalId, kind: item.kind }))) : []
    const items = page.map(item => {
      const row = rows.find(row => row.logicalId === item.logicalId && row.kind === item.kind)
      const text = item.translations[query.locale]
      const display = { id: item.key, kind: item.kind, ...text, categories: item.categories, coverKey: item.coverKey,
        ...('dataMode' in item ? { dataMode: item.dataMode, requirements: item.requirements } : {}) }
      return row ? { ...display, ...this.item(versionItem(row), query.locale), id: item.key } :
        { ...display, state: item.state, releaseId: null, version: null }
    })
    return directoryPageSchema.parse({ items, total: filtered.length, page: query.page, pageSize: query.pageSize })
  }
  private item(row: ReturnType<typeof versionItem>, locale: string): DirectoryItem {
    const details = metadata.parse(row), text = details.translations?.[locale]
    return { id: row.releaseId, releaseId: row.releaseId, kind: row.kind, title: text?.title ?? row.title,
      description: text?.description ?? row.description, categories: row.categories, version: row.version, state: 'released',
      features: [], requirements: details.taskData?.tools ?? [], ...(details.taskData ? { dataMode: details.taskData.mode } : {}), ...(details.presentation?.coverAssetId ? { coverAssetId: details.presentation.coverAssetId } : {}) }
  }
  thumbnail(context: XpertResolvedViewHostContext, releaseId: string, assetId: string) {
    return this.catalog.thumbnail(context, releaseId, assetId)
  }
}
