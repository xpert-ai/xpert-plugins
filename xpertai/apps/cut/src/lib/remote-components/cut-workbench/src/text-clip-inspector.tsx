import * as React from 'react'
import {
  Button, Input, Slider, Switch, Tabs, TabsContent, TabsList, TabsTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import {
  AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart, Bold, Captions, Italic, Palette, Underline
} from 'lucide-react'
import type { CutMessageKey } from './cut-i18n'
import {
  CUT_FONT_FAMILY_OPTIONS, CUT_TEXT_STYLE_PRESETS, cutTextBackgroundCss, cutTextFontFamilyCss,
  cutTextProjectFontSize, cutTextShadowCss, type CutTextStylePatch
} from './cut-text-rendering'
import type { CutClip, CutDocument } from './cut-types'

const h = React.createElement
type Translator = (key: CutMessageKey) => string

export function TextClipInspector({ clip, document, t, onChange }: {
  clip: CutClip
  document: CutDocument
  t: Translator
  onChange: (update: (clip: CutClip) => CutClip) => void
}) {
  const applyPatch = React.useCallback((patch: CutTextStylePatch) => {
    onChange((item) => ({ ...item, ...patch }))
  }, [onChange])

  return <section className="text-inspector-section">
    <div className="inspector-section-title text-inspector-title"><span><Captions />{t('textProperties')}</span><span>{t('caption')}</span></div>
    <label className="text-sync-row"><span>{t('applyToFollowingCaptions')}</span><Switch checked disabled aria-label={t('applyToFollowingCaptions')} /></label>
    <Tabs defaultValue="basic" className="text-property-tabs">
      <TabsList><TabsTrigger value="basic">{t('basicStyle')}</TabsTrigger><TabsTrigger value="presets">{t('presetStyles')}</TabsTrigger><TabsTrigger value="advanced">{t('advancedStyle')}</TabsTrigger></TabsList>
      <TabsContent value="basic" className="text-property-pane">
        <label className="stacked text-content-field"><span>{t('content')}</span><textarea value={clip.text ?? ''} rows={3} onChange={(event) => onChange((item) => ({ ...item, text: event.target.value, name: event.target.value || item.name }))} /></label>
        <label><span>{t('fontFamily')}</span><select className="compact-select" value={clip.fontFamily ?? 'system'} onChange={(event) => {
          const fontFamily = CUT_FONT_FAMILY_OPTIONS.find((candidate) => candidate === event.target.value)
          if (fontFamily) applyPatch({ fontFamily })
        }}>{CUT_FONT_FAMILY_OPTIONS.map((font) => <option key={font} value={font} style={{ fontFamily: cutTextFontFamilyCss(font) }}>{t(font === 'system' ? 'fontSystem' : font === 'sans' ? 'fontSans' : font === 'serif' ? 'fontSerif' : 'fontMono')}</option>)}</select></label>
        <div className="text-size-control"><span>{t('fontSize')}</span><Slider min={8} max={360} step={1} value={[cutTextProjectFontSize(clip, document)]} onValueChange={(value) => applyPatch({ fontSize: value[0] ?? 48 })} /><TextNumberInput value={cutTextProjectFontSize(clip, document)} min={8} max={1000} step={1} onValue={(fontSize) => applyPatch({ fontSize })} /></div>
        <div className="text-style-control"><span>{t('fontStyle')}</span><div>
          <Button type="button" variant={(clip.fontWeight ?? 600) >= 700 ? 'secondary' : 'outline'} size="icon-sm" aria-pressed={(clip.fontWeight ?? 600) >= 700} title={t('bold')} onClick={() => applyPatch({ fontWeight: (clip.fontWeight ?? 600) >= 700 ? 400 : 700 })}><Bold /></Button>
          <Button type="button" variant={clip.fontStyle === 'italic' ? 'secondary' : 'outline'} size="icon-sm" aria-pressed={clip.fontStyle === 'italic'} title={t('italic')} onClick={() => applyPatch({ fontStyle: clip.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic /></Button>
          <Button type="button" variant={clip.textDecoration === 'underline' ? 'secondary' : 'outline'} size="icon-sm" aria-pressed={clip.textDecoration === 'underline'} title={t('underline')} onClick={() => applyPatch({ textDecoration: clip.textDecoration === 'underline' ? 'none' : 'underline' })}><Underline /></Button>
        </div></div>
        <TextColorField label={t('color')} value={clip.color ?? '#ffffff'} onValue={(color) => applyPatch({ color })} />
        <div className="text-pair-grid">
          <label><span>{t('letterSpacing')}</span><TextNumberInput value={clip.letterSpacing ?? 0} min={-100} max={500} step={1} onValue={(letterSpacing) => applyPatch({ letterSpacing })} /></label>
          <label><span>{t('lineHeight')}</span><TextNumberInput value={clip.lineHeight ?? 1.15} min={0.5} max={5} step={0.05} onValue={(lineHeight) => applyPatch({ lineHeight })} /></label>
        </div>
        <TextAlignmentControl clip={clip} t={t} applyPatch={applyPatch} />
      </TabsContent>
      <TabsContent value="presets" className="text-property-pane">
        <div className="text-preset-grid">{CUT_TEXT_STYLE_PRESETS.map((preset) => <button key={preset.id} type="button" title={t(presetMessageKey(preset.id))} onClick={() => applyPatch(preset.patch)} style={{
          color: preset.patch.color,
          background: cutTextBackgroundCss(preset.patch.textBackgroundColor, preset.patch.textBackgroundOpacity),
          WebkitTextStroke: `${preset.patch.strokeWidth ?? 0}px ${preset.patch.strokeColor ?? 'transparent'}`,
          textShadow: `${preset.patch.textShadowOffsetX ?? 0}px ${preset.patch.textShadowOffsetY ?? 0}px ${preset.patch.textShadowBlur ?? 0}px ${preset.patch.textShadowColor ?? 'transparent'}`
        }}><span>Aa</span><small>{t(presetMessageKey(preset.id))}</small></button>)}</div>
      </TabsContent>
      <TabsContent value="advanced" className="text-property-pane">
        <div className="text-subsection-title"><Palette />{t('outline')}</div>
        <TextColorField label={t('strokeColor')} value={clip.strokeColor ?? '#111827'} onValue={(strokeColor) => applyPatch({ strokeColor })} />
        <label><span>{t('strokeWidth')}</span><TextNumberInput value={clip.strokeWidth ?? 0} min={0} max={100} step={0.5} onValue={(strokeWidth) => applyPatch({ strokeWidth })} /></label>
        <div className="text-subsection-title">{t('shadow')}</div>
        <TextColorField label={t('shadowColor')} value={clip.textShadowColor ?? '#000000'} onValue={(textShadowColor) => applyPatch({ textShadowColor })} />
        <div className="text-pair-grid">
          <label><span>{t('shadowBlur')}</span><TextNumberInput value={clip.textShadowBlur ?? 0} min={0} max={200} step={1} onValue={(textShadowBlur) => applyPatch({ textShadowBlur })} /></label>
          <label><span>{t('shadowOffsetX')}</span><TextNumberInput value={clip.textShadowOffsetX ?? 0} min={-500} max={500} step={1} onValue={(textShadowOffsetX) => applyPatch({ textShadowOffsetX })} /></label>
          <label><span>{t('shadowOffsetY')}</span><TextNumberInput value={clip.textShadowOffsetY ?? 0} min={-500} max={500} step={1} onValue={(textShadowOffsetY) => applyPatch({ textShadowOffsetY })} /></label>
        </div>
        <div className="text-subsection-title">{t('textBackground')}</div>
        <TextColorField label={t('background')} value={clip.textBackgroundColor ?? '#111827'} onValue={(textBackgroundColor) => applyPatch({ textBackgroundColor })} />
        <label><span>{t('backgroundOpacity')}</span><TextNumberInput value={(clip.textBackgroundOpacity ?? 0) * 100} min={0} max={100} step={1} onValue={(value) => applyPatch({ textBackgroundOpacity: clamp(value / 100, 0, 1) })} /></label>
        <div className="text-style-preview" style={{
          color: clip.color ?? '#ffffff',
          background: cutTextBackgroundCss(clip.textBackgroundColor, clip.textBackgroundOpacity),
          fontFamily: cutTextFontFamilyCss(clip.fontFamily),
          fontStyle: clip.fontStyle,
          fontWeight: clip.fontWeight,
          letterSpacing: clip.letterSpacing,
          lineHeight: clip.lineHeight,
          textDecoration: clip.textDecoration,
          WebkitTextStroke: `${clip.strokeWidth ?? 0}px ${clip.strokeColor ?? 'transparent'}`,
          textShadow: cutTextShadowCss(clip)
        }}>{clip.text?.trim() || t('captionPreview')}</div>
      </TabsContent>
    </Tabs>
  </section>
}

function TextAlignmentControl({ clip, t, applyPatch }: {
  clip: CutClip
  t: Translator
  applyPatch: (patch: CutTextStylePatch) => void
}) {
  const horizontal = clip.textAlign ?? 'center'
  const vertical = clip.verticalAlign ?? 'middle'
  return <div className="text-alignment-control"><span>{t('textAlign')}</span><div>
    <Button type="button" variant={horizontal === 'left' ? 'secondary' : 'outline'} size="icon-sm" title={t('alignLeft')} aria-pressed={horizontal === 'left'} onClick={() => applyPatch({ textAlign: 'left' })}><AlignLeft /></Button>
    <Button type="button" variant={horizontal === 'center' ? 'secondary' : 'outline'} size="icon-sm" title={t('alignCenter')} aria-pressed={horizontal === 'center'} onClick={() => applyPatch({ textAlign: 'center' })}><AlignCenter /></Button>
    <Button type="button" variant={horizontal === 'right' ? 'secondary' : 'outline'} size="icon-sm" title={t('alignRight')} aria-pressed={horizontal === 'right'} onClick={() => applyPatch({ textAlign: 'right' })}><AlignRight /></Button>
    <span className="text-control-divider" />
    <Button type="button" variant={vertical === 'top' ? 'secondary' : 'outline'} size="icon-sm" title={t('alignTop')} aria-pressed={vertical === 'top'} onClick={() => applyPatch({ verticalAlign: 'top' })}><AlignVerticalJustifyStart /></Button>
    <Button type="button" variant={vertical === 'middle' ? 'secondary' : 'outline'} size="icon-sm" title={t('alignMiddle')} aria-pressed={vertical === 'middle'} onClick={() => applyPatch({ verticalAlign: 'middle' })}><AlignVerticalJustifyCenter /></Button>
    <Button type="button" variant={vertical === 'bottom' ? 'secondary' : 'outline'} size="icon-sm" title={t('alignBottom')} aria-pressed={vertical === 'bottom'} onClick={() => applyPatch({ verticalAlign: 'bottom' })}><AlignVerticalJustifyEnd /></Button>
  </div></div>
}

function TextNumberInput({ value, onValue, ...props }: { value: number; onValue: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <Input type="number" value={Number.isFinite(value) ? round(value) : 0} onChange={(event) => {
    const next = Number(event.target.value)
    if (Number.isFinite(next)) onValue(next)
  }} {...props} />
}

function TextColorField({ label, value, onValue }: { label: string; value: string; onValue: (value: string) => void }) {
  return <label className="text-color-field"><span>{label}</span><span><input type="color" value={normalizeHex(value)} onChange={(event) => onValue(event.target.value)} /><Input value={value} onChange={(event) => onValue(event.target.value)} /></span></label>
}

function presetMessageKey(id: string): CutMessageKey {
  if (id === 'outline') return 'presetOutline'
  if (id === 'yellow') return 'presetYellow'
  if (id === 'red') return 'presetRed'
  if (id === 'bubble') return 'presetBubble'
  if (id === 'shadow') return 'presetShadow'
  return 'presetClean'
}

function normalizeHex(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
