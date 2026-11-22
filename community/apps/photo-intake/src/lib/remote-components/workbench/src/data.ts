import { z } from 'zod/v3'
import { caseDetailSchema, caseSummarySchema } from '../../../domain/contracts'
import type { CaseSummary } from '../../../domain/contracts'
import { activePromptSchema, runDetailSchema, runSummarySchema } from '../../../domain/evaluation'
import type { ActivePrompt, PromptSource } from '../../../domain/evaluation'
import { i18n } from './i18n'

const categorySchema = z.object({ id: z.string(), label: z.record(z.string()), definition: z.string() })
export type CategoryView = z.infer<typeof categorySchema>

const workbenchSchema = z.object({
  cases: z.array(caseSummarySchema),
  categories: z.array(categorySchema),
  selected: caseDetailSchema.nullable(),
  activePrompt: activePromptSchema,
  runs: z.object({ items: z.array(runSummarySchema), total: z.number(), page: z.number() }),
  run: runDetailSchema.nullable()
})
type LoadedData = z.infer<typeof workbenchSchema>
/** `activePrompt` is null only before the first load. */
export type WorkbenchData = Omit<LoadedData, 'activePrompt'> & { activePrompt: ActivePrompt | null }

/** The view never trusts the shape of host data; anything unexpected is a load failure. */
export function parseWorkbenchData(item: unknown): LoadedData {
  return workbenchSchema.parse(item)
}

export function parseCreatedCase(value: unknown): CaseSummary {
  return caseSummarySchema.parse(value)
}

export function categoryLabel(categories: CategoryView[], id: string) {
  const category = categories.find(item => item.id === id)
  return category ? i18n.label(category.label, id) : i18n.t('case.unknownCategory', { id })
}

/** Names where a prompt came from. A run title is user-authored and shown unchanged. */
export function promptSourceLabel(source: PromptSource, runTitle?: string | null) {
  if (source.type === 'default') return i18n.t('prompt.default')
  const version = i18n.t(`version.${source.variant}`)
  return runTitle ? i18n.t('prompt.adopted', { title: runTitle, version }) : i18n.t('prompt.adoptedShort', { version })
}
