import * as React from 'react'
import { Card } from '@xpert-ai/plugin-shadcn-ui/components/card'
import type { RemotePayloadObject } from './runtime'
import type { MotionViewData, ProjectSummary, RecipeSummary } from './motion-types'
import type { Translator } from './i18n'
import { Button, h } from './ui'
import { Stat } from './timeline-panels'
import { htmlRecipeFit, recipeInitials, recipeUsageSummary, videoRecipeFit } from './recipe-utils'

export function LibraryTab(props: {
  recipes: RecipeSummary[]
  stats?: MotionViewData['libraryStats']
  selectedRecipe: RecipeSummary | null
  selectedProject: ProjectSummary | null
  componentSelection: RemotePayloadObject | null
  layerSelection: RemotePayloadObject | null
  t: Translator
  onSelectRecipe: (recipeId: string) => void
  onApplyHtml: (recipe: RecipeSummary) => void
  onApplyVideo: (recipe: RecipeSummary) => void
}) {
  const selected = props.selectedRecipe
  return (
    <section className="motion-library">
      <div className="motion-stat-row">
        <Stat label={props.t('recipes')} value={props.stats?.recipes} />
        <Stat label={props.t('htmlTemplates')} value={props.stats?.htmlTemplates} />
        <Stat label={props.t('videoTemplates')} value={props.stats?.videoTemplates} />
        <Stat label={props.t('icons')} value={props.stats?.icons} />
      </div>
      <div className="motion-library-layout">
        <div className="motion-card-grid">
          {props.recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={selected?.id === recipe.id ? 'motion-card motion-recipe-card active' : 'motion-card motion-recipe-card'}
              onClick={() => props.onSelectRecipe(recipe.id)}
            >
              <div className="motion-card-preview" data-kind={recipe.category || recipe.cat || 'motion'}>
                <span>{recipeInitials(recipe)}</span>
              </div>
              <div>
                <h3>{recipe.name}</h3>
                <p>{recipe.desc || recipe.description || recipe.id}</p>
              </div>
              <div className="motion-chip-row">
                {(recipe.surfaces || []).slice(0, 2).map((item) => (
                  <span key={item} className="motion-chip">
                    {item}
                  </span>
                ))}
                {(recipe.target || []).slice(0, 1).map((item) => (
                  <span key={item} className="motion-chip">
                    {item}
                  </span>
                ))}
                <span className="motion-chip">{recipe.status || props.t('ready')}</span>
              </div>
            </button>
          ))}
          {props.recipes.length === 0 ? <div className="motion-empty">{props.t('noRecipes')}</div> : null}
        </div>
        <Card className="motion-recipe-detail">
          {selected ? (
            <>
              <div className="recipe-detail-head">
                <div>
                  <span className="section-eyebrow">{props.t('selectedRecipe')}</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.desc || selected.description || selected.id}</p>
                </div>
                <div className="motion-recipe-preview" data-kind={selected.category || selected.cat || 'motion'}>
                  {recipeInitials(selected)}
                </div>
              </div>
              <div className="motion-chip-row">
                <span className="motion-chip">{selected.category || selected.cat || 'motion'}</span>
                {(selected.surfaces || []).map((item) => (
                  <span key={item} className="motion-chip">
                    {item}
                  </span>
                ))}
                {(selected.runtime || []).slice(0, 2).map((item) => (
                  <span key={item} className="motion-chip">
                    {item}
                  </span>
                ))}
              </div>
              <div className="recipe-fit-grid">
                <div>
                  <strong>{props.t('htmlFit')}</strong>
                  <span>{htmlRecipeFit(selected, props.componentSelection, props.t)}</span>
                </div>
                <div>
                  <strong>{props.t('videoFit')}</strong>
                  <span>{videoRecipeFit(selected, props.layerSelection, props.t)}</span>
                </div>
              </div>
              <div className="recipe-action-grid">
                <Button onClick={() => props.onApplyHtml(selected)}>{props.t('applyToHtml')}</Button>
                <Button variant="secondary" onClick={() => props.onApplyVideo(selected)}>
                  {props.t('applyToVideo')}
                </Button>
              </div>
              <div className="recipe-usage-note">
                <strong>{props.selectedProject?.title || props.t('referencedDraft')}</strong>
                <span>{recipeUsageSummary(selected, props.componentSelection, props.layerSelection, props.t)}</span>
              </div>
            </>
          ) : (
            <div className="motion-empty">{props.t('recipeSelectEmpty')}</div>
          )}
        </Card>
      </div>
    </section>
  )
}
