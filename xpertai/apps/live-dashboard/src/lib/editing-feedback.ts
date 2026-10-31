import { RequestContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const messages = {
  en: 'Please select a dashboard to edit first.',
  'zh-Hans': '请先选择要编辑的看板',
  'zh-Hant': '請先選擇要編輯的看板'
} as const
const languageConfig = z.object({ configurable: z.object({ language: z.string().optional() }).optional() })

/** Missing selection is a normal interaction outcome; no Artifact operation is attempted. */
export function dashboardSelectionRequired(config: unknown) {
  const parsed = languageConfig.safeParse(config)
  const language = (parsed.success ? parsed.data.configurable?.language : undefined) ?? RequestContext.getLanguageCode()
  const locale = language.toLowerCase().replaceAll('_', '-')
  const key = ['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'].includes(locale) ? 'zh-Hant' : locale === 'zh' || locale.startsWith('zh-') ? 'zh-Hans' : 'en'
  return { status: 'selection_required' as const, message: messages[key] }
}
