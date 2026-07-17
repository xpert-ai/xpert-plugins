export const CUT_EXPORT_FORMATS = ['mp4', 'webm'] as const
export const CUT_EXPORT_QUALITIES = ['low', 'medium', 'high', 'very_high'] as const

export type CutExportFormat = typeof CUT_EXPORT_FORMATS[number]
export type CutExportQuality = typeof CUT_EXPORT_QUALITIES[number]

export interface CutExportSettings {
  format: CutExportFormat
  quality: CutExportQuality
  includeAudio: boolean
}

export const DEFAULT_CUT_EXPORT_SETTINGS: CutExportSettings = {
  format: 'mp4',
  quality: 'high',
  includeAudio: true
}

export function normalizeCutExportSettings(value?: Partial<CutExportSettings> | null): CutExportSettings {
  return {
    format: isCutExportFormat(value?.format) ? value.format : DEFAULT_CUT_EXPORT_SETTINGS.format,
    quality: isCutExportQuality(value?.quality) ? value.quality : DEFAULT_CUT_EXPORT_SETTINGS.quality,
    includeAudio: typeof value?.includeAudio === 'boolean' ? value.includeAudio : DEFAULT_CUT_EXPORT_SETTINGS.includeAudio
  }
}

export function cutExportProfile(settings: CutExportSettings) {
  return settings.format === 'webm'
    ? { extension: 'webm' as const, mimeType: 'video/webm' as const, videoCodec: 'vp9' as const, audioCodec: 'opus' as const }
    : { extension: 'mp4' as const, mimeType: 'video/mp4' as const, videoCodec: 'avc' as const, audioCodec: 'aac' as const }
}

export function isCutExportFormat(value: unknown): value is CutExportFormat {
  return typeof value === 'string' && CUT_EXPORT_FORMATS.includes(value as CutExportFormat)
}

export function isCutExportQuality(value: unknown): value is CutExportQuality {
  return typeof value === 'string' && CUT_EXPORT_QUALITIES.includes(value as CutExportQuality)
}
