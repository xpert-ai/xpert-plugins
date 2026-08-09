import * as React from 'react'
import {
  Button,
  Check,
  ChevronDown,
  MoreHorizontal,
  Plus,
  RotateCcw
} from '@xpert-ai/plugin-shadcn-ui'
import { DirectorAssemblyPage } from './director-assembly-page'
import { DirectorAssetsPage } from './director-assets-page'
import { DirectorScriptPage } from './director-script-page'
import { DirectorStoryboardPage } from './director-storyboard-page'
import {
  DIRECTOR_STAGE,
  type DirectorStage,
  type DirectorWorkbenchProps
} from './director-types'
import { createManualStarterProduction } from './manual-production'
import './tailwind.css'
import './director-shell.css'
import './director-pages.css'
import './director-script.css'
import './director-assets.css'
import './director-storyboard.css'
import './studio-panel-layout.css'

const h: typeof React.createElement = React.createElement

const NAV_ITEMS = [
  { stage: DIRECTOR_STAGE.script, key: 'director.nav.script' },
  { stage: DIRECTOR_STAGE.assets, key: 'director.nav.assets' },
  { stage: DIRECTOR_STAGE.storyboard, key: 'director.nav.storyboard' },
  { stage: DIRECTOR_STAGE.assembly, key: 'director.nav.assembly' }
] as const

export function DirectorWorkbench(props: DirectorWorkbenchProps) {
  const {
    projects,
    selected,
    production,
    productionPersisted,
    handoff,
    activeStage,
    busy,
    generating,
    videoGenerators,
    videoTasks,
    handingOff,
    t
  } = props
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false)
  const scriptBeforeLeaveRef = React.useRef<(() => Promise<boolean>) | null>(null)
  const normalizedStage = normalizeDirectorStage(activeStage)

  async function leaveScript(action: () => void) {
    if (
      normalizedStage === DIRECTOR_STAGE.script &&
      scriptBeforeLeaveRef.current &&
      !(await scriptBeforeLeaveRef.current())
    ) {
      return
    }
    action()
  }

  if (!selected) {
    return (
      <div className="director-root director-empty-root">
        <header className="director-topbar">
          <div className="director-project-title"><strong>Story Studio</strong></div>
          <div className="director-toolbar-spacer" />
          <Button variant="outline" size="sm" onClick={props.onRefresh}><RotateCcw aria-hidden="true" />{t('actions.refresh')}</Button>
          <Button variant="outline" size="sm" onClick={props.onLoadDemo}>{t('actions.loadDemo')}</Button>
          <Button size="sm" onClick={props.onNewProject}><Plus aria-hidden="true" />{t('actions.newProject')}</Button>
        </header>
        <main className="director-empty-state">
          <span>SS</span><h1>{t('project.noSelection')}</h1><p>{t('production.emptyHelp')}</p>
          <div><Button variant="outline" onClick={props.onLoadDemo}>{t('actions.loadDemo')}</Button><Button onClick={props.onNewProject}><Plus aria-hidden="true" />{t('actions.newProject')}</Button></div>
        </main>
      </div>
    )
  }

  const activeProduction =
    production ?? createManualStarterProduction(selected, t)

  return (
    <div className="director-root" data-testid="director-workbench">
      <header className="director-topbar">
        <div className="director-project-switcher">
          <button type="button" className="director-project-title" onClick={() => setProjectMenuOpen((value) => !value)} aria-expanded={projectMenuOpen}>
            <strong>《{selected.title}》</strong><span>·</span><b>{t('director.episodeOne')}</b><ChevronDown aria-hidden="true" />
          </button>
          {projectMenuOpen ? (
            <div className="director-project-menu">
              <header><strong>{t('projects.title')}</strong><button type="button" onClick={() => setProjectMenuOpen(false)}><MoreHorizontal aria-hidden="true" /></button></header>
              {projects.slice(0, 8).map((project) => (
                <button key={project.id} type="button" className={project.id === selected.id ? 'is-selected' : ''} onClick={() => void leaveScript(() => { props.onSelectProject(project.id); setProjectMenuOpen(false) })}>
                  <span>{project.title.slice(0, 1)}</span><div><strong>{project.title}</strong><small>{project.aspectRatio} · R{project.revision}</small></div>{project.id === selected.id ? <Check aria-hidden="true" /> : null}
                </button>
              ))}
              <footer><Button variant="outline" size="sm" onClick={() => void leaveScript(() => { props.onLoadDemo(); setProjectMenuOpen(false) })}>{t('actions.loadDemo')}</Button><Button size="sm" onClick={() => void leaveScript(() => { props.onNewProject(); setProjectMenuOpen(false) })}><Plus aria-hidden="true" />{t('actions.newProject')}</Button></footer>
            </div>
          ) : null}
        </div>

        <nav className="director-primary-nav" aria-label={t('app.subtitle')}>
          {NAV_ITEMS.map((item) => (
            <button key={item.stage} type="button" className={normalizedStage === item.stage ? 'is-active' : ''} aria-current={normalizedStage === item.stage ? 'page' : undefined} onClick={() => void leaveScript(() => props.onNavigate(item.stage))}>
              {t(item.key)}
            </button>
          ))}
        </nav>

        <div className="director-top-status">
          <span className="is-saved">{productionPersisted ? <i><Check aria-hidden="true" /></i> : null}{productionPersisted ? t('director.saved', { time: '10:24' }) : t('manualProduction.draft')}</span>
          <span className="director-budget"><b>{productionPersisted ? t('director.costSummary') : t('project.status')}</b><strong>{productionPersisted ? t('director.costPending') : t('manualProduction.unsaved')}</strong></span>
          <div className="director-account-menu-wrap">
            <button type="button" className="director-account-button" aria-label={t('director.projectMenu')} onClick={() => setAccountMenuOpen((value) => !value)}><span>导</span><ChevronDown aria-hidden="true" /></button>
            {accountMenuOpen ? (
              <div className="director-account-menu">
                <button type="button" onClick={() => void leaveScript(() => { props.onRefresh(); setAccountMenuOpen(false) })}><RotateCcw aria-hidden="true" />{t('actions.refresh')}</button>
                <button type="button" onClick={() => void leaveScript(() => { props.onLoadDemo(); setAccountMenuOpen(false) })}>{t('director.visualDemo')}</button>
                <button type="button" onClick={() => void leaveScript(() => { props.onNewProject(); setAccountMenuOpen(false) })}><Plus aria-hidden="true" />{t('actions.newProject')}</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="director-workspace">
        {normalizedStage === DIRECTOR_STAGE.script ? (
          <DirectorScriptPage production={activeProduction} busy={busy} t={t} onCommitProduction={(draft, summary, options) => props.onCommitProduction(4, draft, summary, options)} onRequestSuggestion={props.onRequestScriptSuggestion} onOpenStoryboard={() => props.onNavigate(DIRECTOR_STAGE.storyboard)} onRegisterBeforeLeave={(handler) => { scriptBeforeLeaveRef.current = handler }} />
        ) : null}
        {normalizedStage === DIRECTOR_STAGE.assets ? (
          <DirectorAssetsPage production={activeProduction} busy={busy} t={t} onCommitProduction={(draft, summary) => props.onCommitProduction(5, draft, summary)} onGenerateAsset={props.onGenerateAsset} onUploadAsset={props.onUploadAsset} onLockAsset={props.onLockAsset} />
        ) : null}
        {normalizedStage === DIRECTOR_STAGE.storyboard ? (
          <DirectorStoryboardPage production={activeProduction} busy={busy} generating={generating} videoGenerators={videoGenerators} videoTasks={videoTasks} t={t} onCommitProduction={(draft, summary) => props.onCommitProduction(6, draft, summary)} onGenerateTakes={props.onGenerateTakes} onSetVideoGenerator={props.onSetVideoGenerator} onCancelVideoTask={props.onCancelVideoTask} onRetryVideoTask={props.onRetryVideoTask} onSelectTake={props.onSelectTake} onUploadAsset={props.onUploadAsset} onUploadShotReference={props.onUploadShotReference} />
        ) : null}
        {normalizedStage === DIRECTOR_STAGE.assembly ? (
          <DirectorAssemblyPage production={activeProduction} handoff={handoff} projectRevision={selected.revision} aspectRatio={selected.aspectRatio} busy={busy} handingOff={handingOff} t={t} onHandoff={props.onHandoff} onReturnStoryboard={() => props.onNavigate(DIRECTOR_STAGE.storyboard)} />
        ) : null}
      </main>
    </div>
  )
}

function normalizeDirectorStage(stage: number): DirectorStage {
  if (stage === DIRECTOR_STAGE.script) return DIRECTOR_STAGE.script
  if (stage === DIRECTOR_STAGE.assets) return DIRECTOR_STAGE.assets
  if (stage === DIRECTOR_STAGE.assembly) return DIRECTOR_STAGE.assembly
  return DIRECTOR_STAGE.storyboard
}
