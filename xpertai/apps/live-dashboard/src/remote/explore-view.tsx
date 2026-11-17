import * as React from 'react'
import { Button, ArrowLeft, ChevronRight, Folder, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import type { LibraryData } from '../lib/library.schema'
import type { messages } from './i18n'
import { openLibrary } from './library-gateway'
import { ResourceLibrary, type LibraryParameters } from './resource-library'
import insightsArt from '../../assets/explore/insights.svg'
import knowledgeArt from '../../assets/explore/knowledge.svg'
import scheduleArt from '../../assets/explore/schedule.svg'
import extensionsArt from '../../assets/explore/extensions.svg'
type T = ReturnType<typeof messages>
export function ExploreView({ t, data, run, initialAudience, initial = {}, onQuery }: {
  t: T; data: LibraryData; busy: boolean; error: string; run(work: () => Promise<void>): void;
  initialAudience?: 'mine'|'public'; initial?: LibraryParameters; onQuery(parameters: LibraryParameters): void
}) {
  const section = initial.section ?? (initialAudience ? 'resources' : 'home')
  const [reserved, setReserved] = React.useState<'schedule'|'extensions'>()
  const go = (section: 'home'|'insights'|'resources') => onQuery({ ...initial, section, catalogPage: 1 })
  return <div className="explore-recreated mx-auto w-full max-w-6xl px-6 py-8">
    {section === 'home' ? <>
      <header className="mb-10 space-y-3"><h1 className="text-3xl font-semibold tracking-tight">{t.exploreWelcome}</h1><p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{t.exploreWelcomeHint}</p></header>
      <div className="explore-entry-grid">
        <Entry className="explore-entry-insights" kicker={t.exploreInsights} title={t.exploreInsights} description={t.exploreInsightsHint} art={insightsArt} onClick={() => go('insights')}/>
        <Entry className="explore-entry-knowledge" kicker={t.exploreKnowledge} title={t.exploreKnowledge} description={t.exploreKnowledgeHint} art={knowledgeArt} onClick={() => run(() => openLibrary('data'))}/>
        <Entry className="explore-entry-schedule" kicker={t.exploreSchedule} title={t.exploreSchedule} description={t.exploreScheduleHint} art={scheduleArt} onClick={() => setReserved('schedule')}/>
        <Entry className="explore-entry-extensions" kicker={t.exploreExtensions} title={t.exploreExtensions} description={t.exploreExtensionsHint} art={extensionsArt} onClick={() => setReserved('extensions')}/>
      </div>
      <div className="mt-6 flex flex-wrap gap-3"><Button variant="ghost" onClick={() => go('resources')}><Folder/>{t.exploreManage}</Button><Button variant="ghost" onClick={() => run(() => openLibrary('data', { audience: 'public' }))}>{t.exploreBrowse}<ChevronRight/></Button></div>
    </> : <>
      <Button variant="outline" onClick={() => go('home')}><ArrowLeft/>{t.exploreBack}</Button>
      <header className="my-8 space-y-3"><h1 className="text-3xl font-semibold tracking-tight">{t.exploreInsights}</h1><p className="text-base text-muted-foreground">{t.exploreInsightsSubtitle}</p></header>
      <ResourceLibrary t={t} data={data} initialKind="example-task" initialAudience={initialAudience} initial={initial} onQuery={next => onQuery({ ...next, section })} embedded/>
    </>}
    <Dialog open={!!reserved} onOpenChange={open => { if (!open) setReserved(undefined) }}><DialogContent><DialogHeader><DialogTitle>{reserved === 'schedule' ? t.exploreSchedule : t.exploreExtensions}</DialogTitle><DialogDescription>{reserved === 'schedule' ? t.exploreScheduleReserved : t.exploreExtensionsReserved}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setReserved(undefined)}>{t.cancel}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
function Entry({className,kicker,title,description,art,onClick}:{className:string;kicker:string;title:string;description:string;art:string;onClick():void}){
  return <article className={`relative flex min-w-0 flex-col rounded-2xl bg-muted/40 p-6 ${className}`}>
    <div className="space-y-3"><p className="text-xs tracking-widest text-muted-foreground">{kicker}</p><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2><Button variant="ghost" size="icon" onClick={onClick} aria-label={title}><span className="absolute inset-0" aria-hidden="true"/><ChevronRight/></Button></div><p className="text-sm leading-relaxed text-muted-foreground">{description}</p></div>
    <img src={art} alt="" className="explore-entry-art mt-auto self-end object-contain"/>
  </article>
}
