import * as React from 'react'
import {
  Badge,
  Button,
  ChevronRight,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  WandSparkles
} from '@xpert-ai/plugin-shadcn-ui'
import type { MessageKey } from './i18n'
import {
  STORY_TEMPLATES,
  type StoryTemplate,
  type StoryTemplateCategory,
  templateShotCount
} from './story-templates'
import './template-center.css'

const h: typeof React.createElement = React.createElement

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

const CATEGORY_KEYS: Record<StoryTemplateCategory | 'all', MessageKey> = {
  all: 'templates.categories.all',
  vertical: 'templates.categories.vertical',
  horizontal: 'templates.categories.horizontal',
  series: 'templates.categories.series'
}

const FORMAT_KEYS: Record<StoryTemplate['format'], MessageKey> = {
  vertical_short: 'format.vertical_short',
  horizontal_short: 'format.horizontal_short',
  episodic_series: 'format.episodic_series',
  feature: 'format.feature',
  custom: 'format.custom'
}

function blueprintShotCount(template: StoryTemplate) {
  return templateShotCount(template)
}

export function TemplateCenterDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseTemplate: (template: StoryTemplate) => void
  t: Translator
}) {
  const { open, onOpenChange, onUseTemplate, t } = props
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<StoryTemplateCategory | 'all'>('all')
  const [previewTemplateId, setPreviewTemplateId] = React.useState(STORY_TEMPLATES[0]?.id ?? '')

  const filteredTemplates = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return STORY_TEMPLATES.filter((template) => {
      if (category !== 'all' && template.category !== category) return false
      if (!normalizedQuery) return true
      const searchable = [
        t(template.title),
        t(template.description),
        t(template.premise),
        ...template.tags.map((tag) => t(tag))
      ].join(' ').toLocaleLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [category, query, t])

  React.useEffect(() => {
    if (filteredTemplates.some((template) => template.id === previewTemplateId)) return
    setPreviewTemplateId(filteredTemplates[0]?.id ?? '')
  }, [filteredTemplates, previewTemplateId])

  const previewTemplate = STORY_TEMPLATES.find((template) => template.id === previewTemplateId) ?? filteredTemplates[0] ?? null

  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setCategory('all')
      setPreviewTemplateId(STORY_TEMPLATES[0]?.id ?? '')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ss-template-dialog" data-testid="template-center-dialog">
        <DialogHeader>
          <div className="ss-template-heading-row">
            <div>
              <DialogTitle>{t('templates.title')}</DialogTitle>
              <DialogDescription>{t('templates.description')}</DialogDescription>
            </div>
            <Badge variant="outline" className="ss-template-count">{t('templates.count', { count: STORY_TEMPLATES.length })}</Badge>
          </div>
        </DialogHeader>
        <div className="ss-template-toolbar">
          <Input
            aria-label={t('templates.search')}
            placeholder={t('templates.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select value={category} onValueChange={(value) => setCategory(value as StoryTemplateCategory | 'all')}>
            <SelectTrigger size="sm" aria-label={t('templates.category')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CATEGORY_KEYS) as Array<StoryTemplateCategory | 'all'>).map((value) => (
                <SelectItem key={value} value={value}>{t(CATEGORY_KEYS[value])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ss-template-layout">
          <div className="ss-template-list" role="list" aria-label={t('templates.list')}>
            {filteredTemplates.length ? filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="listitem"
                className={`ss-template-card ss-template-card-${template.accent} ${template.id === previewTemplate?.id ? 'is-previewing' : ''}`}
                data-testid={`template-card-${template.id}`}
                aria-pressed={template.id === previewTemplate?.id}
                onClick={() => setPreviewTemplateId(template.id)}
              >
                <span className="ss-template-cover" aria-hidden="true"><span>{t(FORMAT_KEYS[template.format]).slice(0, 1)}</span></span>
                <span className="ss-template-card-copy">
                  <strong>{t(template.title)}</strong>
                  <small>{t(CATEGORY_KEYS[template.category])} · {template.aspectRatio} · {template.duration}s</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            )) : <div className="ss-template-empty">{t('templates.empty')}</div>}
          </div>
          <div className="ss-template-detail" aria-live="polite">
            {previewTemplate ? (
              <>
                <div className={`ss-template-detail-cover ss-template-detail-cover-${previewTemplate.accent}`} aria-hidden="true">
                  <span>{t(FORMAT_KEYS[previewTemplate.format])}</span>
                  <b>{previewTemplate.aspectRatio}</b>
                </div>
                <div className="ss-template-detail-body">
                  <div className="ss-template-detail-kicker">{t(CATEGORY_KEYS[previewTemplate.category])}</div>
                  <h2>{t(previewTemplate.title)}</h2>
                  <p className="ss-template-detail-description">{t(previewTemplate.description)}</p>
                  <div className="ss-template-meta">
                    <span><b>{t('templates.format')}</b>{t(FORMAT_KEYS[previewTemplate.format])}</span>
                    <span><b>{t('templates.ratio')}</b>{previewTemplate.aspectRatio}</span>
                    <span><b>{t('templates.duration')}</b>{t('templates.seconds', { count: previewTemplate.duration })}</span>
                  </div>
                  <section className="ss-template-blueprint" aria-label={t('templates.blueprint')}>
                    <div className="ss-template-section-heading">
                      <span>{t('templates.blueprint')}</span>
                      <Badge variant="outline">{t('templates.blueprint.ready')}</Badge>
                    </div>
                    <div className="ss-template-blueprint-stats">
                      <span><strong>{previewTemplate.blueprint.episodes.length}</strong>{t('templates.blueprint.episodes')}</span>
                      <span><strong>{previewTemplate.blueprint.scenes.length}</strong>{t('templates.blueprint.scenes')}</span>
                      <span><strong>{blueprintShotCount(previewTemplate)}</strong>{t('templates.blueprint.shots')}</span>
                      <span><strong>{previewTemplate.blueprint.assets.length}</strong>{t('templates.blueprint.assets')}</span>
                    </div>
                    <div className="ss-template-blueprint-signals">
                      <span><b>{t('templates.blueprint.style')}</b>{t(previewTemplate.blueprint.visualStyle)}</span>
                      <span><b>{t('templates.blueprint.theme')}</b>{t(previewTemplate.blueprint.theme)}</span>
                      <span><b>{t('templates.blueprint.tone')}</b>{t(previewTemplate.blueprint.tone)}</span>
                    </div>
                    <div className="ss-template-blueprint-section">
                      <span className="ss-template-blueprint-label">{t('templates.blueprint.scenePlan')}</span>
                      <div className="ss-template-phase-list">
                        {previewTemplate.blueprint.scenes.map((scene, index) => (
                          <div key={`${scene.title}-${index}`} className="ss-template-phase-row">
                            <span className="ss-template-phase-index">{index + 1}</span>
                            <span>
                              <strong>{t(scene.title)}</strong>
                              <small>{t(scene.summary)}</small>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ss-template-blueprint-section">
                      <span className="ss-template-blueprint-label">{t('templates.blueprint.assetSlots')}</span>
                      <div className="ss-template-tags">
                        {previewTemplate.blueprint.assets.map((asset, index) => (
                          <Badge key={`${asset.kind}-${index}`} variant="secondary">{t(asset.name)}</Badge>
                        ))}
                      </div>
                    </div>
                  </section>
                  <div className="ss-template-premise">
                    <span>{t('templates.premise')}</span>
                    <p>{t(previewTemplate.premise)}</p>
                  </div>
                  <div className="ss-template-tags">
                    {previewTemplate.tags.map((tag) => <Badge key={tag} variant="secondary">{t(tag)}</Badge>)}
                  </div>
                  <Button className="ss-template-use" onClick={() => onUseTemplate(previewTemplate)}>
                    <WandSparkles aria-hidden="true" />{t('templates.use')}
                  </Button>
                  <p className="ss-template-note">{t('templates.useHelp')}</p>
                </div>
              </>
            ) : <div className="ss-template-empty ss-template-detail-empty">{t('templates.empty')}</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
