import * as React from 'react'
import { BookOpen, Database, RotateCcw, Search } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent
} from '@xpert-ai/plugin-shadcn-ui'
import type { KnowledgePriceCandidate, KnowledgeSearchData, Knowledgebase } from '../view-data'
import {
  firstNumber,
  firstText,
  formatScore,
  knowledgeResultKey,
  type Translate
} from '../presentation'
import { EmptyState } from './ui-helpers'

type KnowledgePanelProps = {
  t: Translate
  knowledge: KnowledgeSearchData
  knowledgebaseId: string
  search: string
  query: string
  loading: boolean
  onSearchChange: (value: string) => void
  onKnowledgebaseChange: (value: string) => void
  onSearch: () => void
}

export function KnowledgePanel(props: KnowledgePanelProps) {
  const activeKnowledgebase = props.knowledge.summary.knowledgebases.find((item) => item.id === props.knowledgebaseId)
  return <TabsContent value="knowledge" className="col-start-2 row-start-2 m-3 min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm data-[state=active]:grid data-[state=active]:grid-rows-[auto_auto_minmax(0,1fr)] max-[1100px]:col-start-1 max-[1100px]:row-start-3 max-[1100px]:m-2">
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-card px-4 py-2 max-md:flex-col max-md:items-stretch">
      <div className="flex min-w-52 items-center gap-2">
        <Database aria-hidden className="size-5 text-primary"/>
        <div className="min-w-0">
          <strong className="block text-sm font-semibold">{props.t('knowledgeBase')}</strong>
          <span className="block text-[11px] leading-4 text-muted-foreground">{props.t('knowledgeDescription')}</span>
        </div>
      </div>
      <form className="flex min-w-0 flex-1 items-center justify-end gap-2 max-md:flex-wrap" onSubmit={(event) => { event.preventDefault(); props.onSearch() }}>
        <Select
          value={props.knowledgebaseId || undefined}
          disabled={props.loading || props.knowledge.summary.knowledgebases.length === 0}
          onValueChange={props.onKnowledgebaseChange}
        >
          <SelectTrigger aria-label={props.t('knowledgeBase')} className="w-56 cursor-pointer bg-background max-md:flex-1">
            <SelectValue placeholder={props.t('selectKnowledgebase')}/>
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {props.knowledge.summary.knowledgebases.map((item) => <SelectItem className="cursor-pointer" key={item.id} value={item.id}>{item.name || item.id}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex min-w-64 flex-1 items-center rounded-md border border-input bg-background pl-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground"/>
          <Input
            aria-label={props.t('knowledgeSearch')}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            value={props.search}
            placeholder={props.t('knowledgeSearchPlaceholder')}
            onChange={(event) => props.onSearchChange(event.currentTarget.value)}
          />
        </div>
        <Button type="submit" className="cursor-pointer" disabled={props.loading || !props.knowledgebaseId || !props.search.trim()}>
          <Search aria-hidden className="size-4"/>{props.t('knowledgeSearchAction')}
        </Button>
      </form>
    </header>

    <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
      <span>{props.t('connectedKnowledgebases')} <strong className="text-foreground">{props.knowledge.summary.knowledgebases.length}</strong></span>
      {props.knowledgebaseId && <span>{props.t('knowledgeChunks')} <strong className="text-foreground">{activeKnowledgebase?.chunkNum ?? props.t('none')}</strong></span>}
      {props.query && <span className="ml-auto flex min-w-0 gap-1 max-md:ml-0 max-md:w-full">
        {props.t('currentQuery')} <strong className="truncate text-foreground">{props.query}</strong>
      </span>}
    </div>

    <ScrollArea className="min-h-0 bg-muted/20" aria-busy={props.loading}>
      {props.loading
        ? <EmptyState icon={<RotateCcw aria-hidden className="size-6 animate-spin motion-reduce:animate-none"/>} title={props.t('knowledgeSearching')}/>
        : props.knowledge.summary.knowledgebases.length === 0
          ? <EmptyState icon={<Database aria-hidden className="size-7"/>} title={props.t('noConnectedKnowledgebases')} description={props.t('noConnectedKnowledgebasesHint')}/>
          : props.knowledge.summary.queryRequired || !props.query
            ? <EmptyState icon={<Search aria-hidden className="size-7"/>} title={props.t('knowledgeQueryRequired')} description={props.t('knowledgeQueryRequiredHint')}/>
            : props.knowledge.summary.errorCode === 'knowledgebase_runtime_unavailable'
              ? <EmptyState icon={<Database aria-hidden className="size-7"/>} title={props.t('knowledgeUnavailable')} description={props.t('knowledgeUnavailableHint')}/>
              : props.knowledge.summary.errorCode === 'knowledgebase_search_failed'
                ? <EmptyState icon={<RotateCcw aria-hidden className="size-7"/>} title={props.t('knowledgeSearchFailed')} description={props.t('knowledgeSearchFailedHint')}/>
                : props.knowledge.items.length === 0
                  ? <EmptyState icon={<BookOpen aria-hidden className="size-7"/>} title={props.t('noKnowledgeResults')} description={props.t('noKnowledgeResultsHint')}/>
                  : <div className="mx-auto grid max-w-6xl gap-3 p-4">
                    {props.knowledge.items.map((item, index) => <KnowledgeResult
                      key={knowledgeResultKey(item, index)}
                      item={item}
                      knowledgebases={props.knowledge.summary.knowledgebases}
                      t={props.t}
                    />)}
                  </div>}
    </ScrollArea>
  </TabsContent>
}

function KnowledgeResult({ item, knowledgebases, t }: {
  item: KnowledgePriceCandidate
  knowledgebases: Knowledgebase[]
  t: Translate
}) {
  const knowledgebaseId = item.knowledgebaseId
  const knowledgebaseName = firstText(
    item.knowledgebaseName,
    knowledgebases.find((entry) => entry.id === knowledgebaseId)?.name,
    knowledgebaseId
  )
  const documentId = item.documentId
  const chunkId = firstText(item.chunkId, item.id)
  const documentName = firstText(item.documentName, t('knowledgeDocument'))
  const score = firstNumber(item.relevanceScore, item.score)
  return <Card className="gap-3 py-4 shadow-sm transition-colors duration-200 hover:border-primary/40">
    <CardHeader className="flex-row items-start justify-between gap-3 px-4 py-0">
      <div className="flex min-w-0 items-center gap-2">
        <BookOpen aria-hidden className="size-4 shrink-0 text-primary"/>
        <strong className="break-words text-sm">{documentName}</strong>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {knowledgebaseName && <Badge variant="outline">{knowledgebaseName}</Badge>}
        {score != null && <Badge variant="secondary">{t('knowledgeScore')} {formatScore(score)}</Badge>}
      </div>
    </CardHeader>
    <CardContent className="grid gap-3 px-4 py-0">
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{item.pageContent || t('knowledgeContentUnavailable')}</p>
      <dl className="grid grid-cols-3 gap-3 text-[11px] text-muted-foreground max-md:grid-cols-1">
        {knowledgebaseId && <MetaItem label={t('knowledgeBaseId')} value={knowledgebaseName || knowledgebaseId}/>}
        {documentId && <MetaItem label={t('knowledgeDocumentId')} value={documentId}/>}
        {chunkId && <MetaItem label={t('knowledgeChunkId')} value={chunkId}/>}
      </dl>
    </CardContent>
  </Card>
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 gap-1">
    <dt className="shrink-0 font-semibold text-foreground">{label}</dt>
    <dd className="truncate" title={value}>{value}</dd>
  </div>
}
