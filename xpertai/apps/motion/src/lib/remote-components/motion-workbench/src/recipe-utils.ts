import type { MotionTemplateKey, MotionTrackPoint } from '../../../workbench-model'
import type { RemotePayloadObject } from './runtime'
import { KEYFRAME_PROPS, type HtmlControls, type RecipeSummary } from './motion-types'
import { labelForTrigger, type Translator } from './i18n'
import { cssEscape } from './html-workbench-utils'

export function recipeInitials(recipe: RecipeSummary) {
  const initials = recipe.name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return initials || 'MO'
}

export function recipeSearchText(recipe: RecipeSummary) {
  return [
    recipe.id,
    recipe.name,
    recipe.category,
    recipe.cat,
    recipe.desc,
    recipe.description,
    ...(recipe.surfaces || []),
    ...(recipe.target || []),
    ...(recipe.runtime || []),
    ...(recipe.export || []),
    ...(recipe.tags || [])
  ]
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .join(' ')
    .toLowerCase()
}

export function controlsForRecipe(recipe: RecipeSummary, current: HtmlControls, selection: RemotePayloadObject | null): HtmlControls {
  const text = recipeSearchText(recipe)
  const verb = htmlVerbForRecipe(text)
  const distance = text.includes('subtle') || text.includes('restrained') ? 18 : text.includes('bold') || text.includes('spark') ? 34 : current.distance
  const duration = text.includes('typewriter') ? 960 : text.includes('spark') || text.includes('click') ? 420 : text.includes('slow') ? 900 : current.duration
  const selectedId = typeof selection?.componentId === 'string' ? selection.componentId : ''
  return {
    ...current,
    selector: selectedId ? `[data-ma-id="${cssEscape(selectedId)}"]` : current.selector || 'h1',
    trigger: triggerForRecipe(text, current.trigger),
    verb,
    duration,
    distance,
    tracksJson: JSON.stringify(htmlTracksForRecipe(verb, distance, text), null, 2)
  }
}

export function resolveHtmlRecipeSelector(html: string, preferred: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const preferredSelector = preferred.trim()
  if (preferredSelector && selectorMatches(doc, preferredSelector)) {
    return preferredSelector
  }
  const fallbackSelectors = ['[data-ma-id]', 'h1', 'h2', 'h3', 'button', 'a', 'p', '[class*="card"]', 'main > *', 'body > *']
  return fallbackSelectors.find((selector) => selectorMatches(doc, selector)) ?? preferredSelector ?? 'body > *'
}

export function triggerForRecipe(text: string, fallback: HtmlControls['trigger']): HtmlControls['trigger'] {
  if (text.includes('hover')) return 'hover'
  if (text.includes('click') || text.includes('spark')) return 'click'
  if (text.includes('scroll') || text.includes('reveal')) return 'scroll'
  if (text.includes('load') || text.includes('entrance') || text.includes('intro')) return 'load'
  return fallback
}

export function htmlVerbForRecipe(text: string): HtmlControls['verb'] {
  if (text.includes('slide left')) return 'slide-left'
  if (text.includes('slide right')) return 'slide-right'
  if (text.includes('slide down')) return 'slide-down'
  if (text.includes('slide') || text.includes('rise') || text.includes('falling')) return 'slide-up'
  if (text.includes('zoom')) return 'zoom'
  if (text.includes('rotate') || text.includes('rotating')) return 'rotate'
  if (text.includes('blur') || text.includes('focus')) return 'blur'
  if (text.includes('pop') || text.includes('spark') || text.includes('bounce')) return 'pop'
  if (text.includes('pulse') || text.includes('heartbeat')) return 'pulse'
  if (text.includes('shake') || text.includes('glitch')) return 'shake'
  if (text.includes('wobble')) return 'wobble'
  if (text.includes('sink')) return 'sink'
  return 'fade'
}

export function htmlTracksForRecipe(verb: HtmlControls['verb'], distance: number, text: string): Record<(typeof KEYFRAME_PROPS)[number], MotionTrackPoint[]> {
  const tracks: Record<(typeof KEYFRAME_PROPS)[number], MotionTrackPoint[]> = defaultTracks()
  if (verb === 'fade') {
    tracks.y = [{ t: 0, v: 0 }, { t: 0.5, v: 0 }]
    tracks.scale = [{ t: 0, v: 1 }, { t: 0.5, v: 1 }]
    tracks.blur = [{ t: 0, v: 0 }, { t: 0.5, v: 0 }]
  }
  if (verb === 'slide-down') {
    tracks.y = [{ t: 0, v: -distance }, { t: 0.55, v: 0, ease: 'ease-out' }]
  }
  if (verb === 'slide-left') {
    tracks.x = [{ t: 0, v: distance }, { t: 0.55, v: 0, ease: 'ease-out' }]
    tracks.y = [{ t: 0, v: 0 }, { t: 0.55, v: 0 }]
  }
  if (verb === 'slide-right') {
    tracks.x = [{ t: 0, v: -distance }, { t: 0.55, v: 0, ease: 'ease-out' }]
    tracks.y = [{ t: 0, v: 0 }, { t: 0.55, v: 0 }]
  }
  if (verb === 'zoom') {
    tracks.scale = [{ t: 0, v: 0.82 }, { t: 0.5, v: 1, ease: 'ease-out' }]
    tracks.y = [{ t: 0, v: 0 }, { t: 0.5, v: 0 }]
  }
  if (verb === 'rotate') {
    tracks.rotate = [{ t: 0, v: -8 }, { t: 0.55, v: 0, ease: 'ease-out' }]
  }
  if (verb === 'blur') {
    tracks.blur = [{ t: 0, v: 16 }, { t: 0.6, v: 0, ease: 'ease-out' }]
  }
  if (verb === 'pop') {
    tracks.scale = [{ t: 0, v: 0.82 }, { t: 0.24, v: 1.08 }, { t: 0.46, v: 1 }]
    tracks.blur = [{ t: 0, v: 0 }, { t: 0.46, v: 0 }]
  }
  if (verb === 'pulse') {
    tracks.opacity = [{ t: 0, v: 1 }, { t: 0.35, v: 0.82 }, { t: 0.7, v: 1 }]
    tracks.scale = [{ t: 0, v: 1 }, { t: 0.35, v: 1.06 }, { t: 0.7, v: 1 }]
  }
  if (verb === 'shake') {
    tracks.x = [{ t: 0, v: 0 }, { t: 0.15, v: -distance / 2 }, { t: 0.3, v: distance / 2 }, { t: 0.45, v: 0 }]
  }
  if (verb === 'wobble') {
    tracks.rotate = [{ t: 0, v: 0 }, { t: 0.18, v: -5 }, { t: 0.38, v: 4 }, { t: 0.6, v: 0 }]
  }
  if (verb === 'sink') {
    tracks.y = [{ t: 0, v: -distance / 2 }, { t: 0.55, v: 0, ease: 'ease-out' }]
  }
  if (text.includes('typewriter')) {
    tracks.opacity = [{ t: 0, v: 0 }, { t: 0.08, v: 1 }]
  }
  return tracks
}

export function motionTemplateForRecipe(recipe: RecipeSummary): MotionTemplateKey {
  const text = recipeSearchText(recipe)
  if (text.includes('slide left')) return 'slide-left'
  if (text.includes('slide right')) return 'slide-right'
  if (text.includes('slide down')) return 'slide-down'
  if (text.includes('zoom out')) return 'zoom-out'
  if (text.includes('zoom')) return 'zoom-in'
  if (text.includes('rotate') || text.includes('rotating')) return 'rotate-in'
  if (text.includes('pop') || text.includes('spark')) return 'pop'
  if (text.includes('bounce')) return 'bounce-in'
  if (text.includes('pulse')) return 'pulse'
  if (text.includes('float')) return 'float'
  if (text.includes('wobble')) return 'wobble'
  if (text.includes('shake') || text.includes('glitch')) return 'shake'
  if (text.includes('heartbeat')) return 'heartbeat'
  if (text.includes('fade out')) return 'fade-out'
  if (text.includes('fade')) return 'fade-in'
  return 'slide-up'
}

export function kineticForRecipe(recipe: RecipeSummary): string | null {
  const text = recipeSearchText(recipe)
  if (text.includes('typewriter')) return 'typewriter'
  if (text.includes('char') || text.includes('letter')) return text.includes('pop') ? 'char-pop' : 'char-rise'
  if (text.includes('word')) return 'word-rise'
  return null
}

export function htmlRecipeFit(recipe: RecipeSummary, selection: RemotePayloadObject | null, t: Translator) {
  const surfaceFit = (recipe.surfaces || []).includes('web') ? t('nativeWebRecipe') : t('mappedFromRecipeIntent')
  const target = typeof selection?.label === 'string' ? selection.label : typeof selection?.componentId === 'string' ? selection.componentId : t('currentSelector')
  return `${surfaceFit}; ${t('appliesToTarget', { target })}.`
}

export function videoRecipeFit(recipe: RecipeSummary, selection: RemotePayloadObject | null, t: Translator) {
  const surfaceFit = (recipe.surfaces || []).includes('video') ? t('nativeVideoRecipe') : t('convertedToLayerTemplate')
  const target = typeof selection?.layerId === 'string' ? selection.layerId : t('firstAvailableLayer')
  return `${surfaceFit}; ${t('appliesToTarget', { target })}.`
}

export function recipeUsageSummary(recipe: RecipeSummary, componentSelection: RemotePayloadObject | null, layerSelection: RemotePayloadObject | null, t: Translator) {
  const trigger = labelForTrigger(triggerForRecipe(recipeSearchText(recipe), 'load'), t)
  const htmlTarget = typeof componentSelection?.label === 'string' ? componentSelection.label : t('htmlSelection')
  const videoTarget = typeof layerSelection?.layerId === 'string' ? t('layerWithId', { id: layerSelection.layerId }) : t('videoLayer')
  return t('recipeUsageSummary', {
    trigger,
    htmlTarget,
    template: motionTemplateForRecipe(recipe),
    videoTarget
  })
}

function selectorMatches(doc: Document, selector: string) {
  try {
    return doc.querySelector(selector) !== null
  } catch {
    return false
  }
}

export function defaultTracks() {
  return {
    opacity: [
      { t: 0, v: 0 },
      { t: 0.5, v: 1 }
    ],
    x: [
      { t: 0, v: 0 },
      { t: 0.5, v: 0 }
    ],
    y: [
      { t: 0, v: 24 },
      { t: 0.5, v: 0, ease: 'ease-out' }
    ],
    scale: [
      { t: 0, v: 0.96 },
      { t: 0.5, v: 1 }
    ],
    rotate: [
      { t: 0, v: 0 },
      { t: 0.5, v: 0 }
    ],
    blur: [
      { t: 0, v: 8 },
      { t: 0.5, v: 0 }
    ]
  }
}
