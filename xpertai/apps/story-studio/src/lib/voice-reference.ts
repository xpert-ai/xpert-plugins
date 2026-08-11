export type VoiceReferenceLike = {
  url: string
  label: string
  license: string | null
  sourceUrl: string | null
  workspacePath?: string | null
  originalName?: string | null
  mimeType?: string | null
  size?: number | null
}

export type VoiceReferenceInput = {
  url?: string | null
  label?: string | null
  license?: string | null
  sourceUrl?: string | null
  workspacePath?: string | null
  originalName?: string | null
  mimeType?: string | null
  size?: number | null
}

export function createVoiceReferenceDraft(
  value?: VoiceReferenceInput | null
): VoiceReferenceLike {
  return {
    url: value?.url?.trim() ?? '',
    label: value?.label?.trim() ?? '',
    license: value?.license?.trim() ?? null,
    sourceUrl: value?.sourceUrl?.trim() ?? null,
    workspacePath: value?.workspacePath?.trim() ?? null,
    originalName: value?.originalName?.trim() ?? null,
    mimeType: value?.mimeType?.trim() ?? null,
    size: typeof value?.size === 'number' ? value.size : null
  }
}

export function updateVoiceReferenceDraft(
  value: VoiceReferenceInput | null | undefined,
  key: 'url' | 'label' | 'license' | 'sourceUrl',
  nextValue: string
): VoiceReferenceLike {
  const next = createVoiceReferenceDraft(value)
  next[key] = nextValue
  return next
}

export function compactVoiceReference(
  value?: VoiceReferenceInput | null
): VoiceReferenceLike | null {
  const url = value?.url?.trim()
  const label = value?.label?.trim()
  if (!url || !label) return null
  const voiceReference: VoiceReferenceLike = {
    url,
    label,
    license: null,
    sourceUrl: null
  }
  const license = value?.license?.trim()
  if (license) voiceReference.license = license
  const sourceUrl = value?.sourceUrl?.trim()
  if (sourceUrl) voiceReference.sourceUrl = sourceUrl
  const workspacePath = value?.workspacePath?.trim()
  if (workspacePath) voiceReference.workspacePath = workspacePath
  const originalName = value?.originalName?.trim()
  if (originalName) voiceReference.originalName = originalName
  const mimeType = value?.mimeType?.trim()
  if (mimeType) voiceReference.mimeType = mimeType
  if (typeof value?.size === 'number') voiceReference.size = value.size
  return voiceReference
}

export function hasPartialVoiceReference(
  value?: VoiceReferenceInput | null
) {
  if (!value) return false
  const hasAnyValue = Boolean(
    value.url?.trim() ||
      value.label?.trim() ||
      value.license?.trim() ||
      value.sourceUrl?.trim()
  )
  return hasAnyValue && !compactVoiceReference(value)
}
