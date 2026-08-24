import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTriangle,
  Badge,
  Bot,
  Box,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CircleDot,
  ClipboardList,
  FileText,
  GitBranch,
  History,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ScrollArea,
  Search,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Upload,
  WandSparkles,
  Wrench,
  cn
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, invokeClientCommand, notify, requestData, syncAssistantContext } from './bridge'
import { TEXT, fieldLabel, resolveLocale } from './i18n'
import type { SupportedLocale } from './i18n'
import type {
  ActionDescriptor,
  AuditEvent,
  HostContext,
  Object360,
  ObjectSummary,
  OntologyInitializationStatus,
  Proposal,
  ProposalStatus,
  ResourceSummary,
  SchemaSummary
} from './types'
import { React } from './vendor'

const { useCallback, useEffect, useRef, useState } = React
type Copy = typeof TEXT.zh_Hans | typeof TEXT.en_US
type PendingTransition = {
  proposal: Proposal
  actionKey: string
  status: ProposalStatus
}

export function ValveWorkbench({ context }: { context: HostContext }) {
  const locale = resolveLocale(context.locale)
  const t = TEXT[locale]
  const [resources, setResources] = useState<ResourceSummary[]>([])
  const [ontologyStatus, setOntologyStatus] = useState<OntologyInitializationStatus | null>(null)
  const [ontologyConfirmOpen, setOntologyConfirmOpen] = useState(false)
  const [resourceId, setResourceId] = useState(readInitialParameter(context, 'resourceId'))
  const [schema, setSchema] = useState<SchemaSummary | null>(null)
  const [entityTypeCode, setEntityTypeCode] = useState(readInitialParameter(context, 'entityTypeCode'))
  const [searchDraft, setSearchDraft] = useState(context.initialQuery?.search ?? '')
  const [search, setSearch] = useState(context.initialQuery?.search ?? '')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [objects, setObjects] = useState<ObjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>(readInitialParameter(context, 'entityId') || undefined)
  const [object360, setObject360] = useState<Object360 | null>(null)
  const [actions, setActions] = useState<ActionDescriptor[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [objectPanelOpen, setObjectPanelOpen] = useState(true)
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null)
  const [transitionNote, setTransitionNote] = useState('')
  const [demoOutcome, setDemoOutcome] = useState<'success' | 'failure'>('success')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const selectionRef = useRef<string | undefined>(selectedId)

  useEffect(() => {
    selectionRef.current = selectedId
  }, [selectedId])

  const loadResources = useCallback(async () => {
    setBusy(true)
    setNotice('')
    try {
      const [resourceResponse, statusResponse] = await Promise.all([
        requestData({ parameters: { mode: 'resources' } }),
        requestData({ parameters: { mode: 'ontology_status' } })
      ])
      const payload = unwrap(resourceResponse)
      const items = readArray<ResourceSummary>(payload, 'items')
      setOntologyStatus(readObject<OntologyInitializationStatus>(unwrap(statusResponse), 'status'))
      setResources(items)
      setResourceId((current) => items.some((item) => item.resourceId === current) ? current : items[0]?.resourceId || '')
    } catch (error) {
      setNotice(readError(error, t.loadFailed))
    } finally {
      setBusy(false)
    }
  }, [t.loadFailed])

  const loadSchemaAndObjects = useCallback(
    async (nextResourceId: string, nextType?: string, nextSearch = search) => {
      if (!nextResourceId) return
      setBusy(true)
      setNotice('')
      try {
        const schemaPayload = unwrap(
          await requestData({ parameters: { mode: 'schema', resourceId: nextResourceId } })
        )
        const nextSchema = readObject<SchemaSummary>(schemaPayload, 'schema')
        if (!nextSchema) throw new Error('Schema response is missing')
        const resolvedType = nextType || entityTypeCode || nextSchema.rootEntityTypeCode
        setSchema(nextSchema)
        setEntityTypeCode(resolvedType)
        const objectPayload = unwrap(
          await requestData({
            search: nextSearch,
            pageSize: 100,
            parameters: {
              mode: 'objects',
              resourceId: nextResourceId,
              entityTypeCode: resolvedType,
              search: nextSearch
            }
          })
        )
        const nextObjects = readArray<ObjectSummary>(objectPayload, 'items')
        setObjects(nextObjects)
        if (!nextObjects.some((item) => item.entityId === selectionRef.current)) {
          setSelectedId(undefined)
          setObject360(null)
          setActions([])
          setProposals([])
          setAudit([])
        }
      } catch (error) {
        setNotice(readError(error, t.loadFailed))
      } finally {
        setBusy(false)
      }
    },
    [entityTypeCode, search, t.loadFailed]
  )

  const submitObjectSearch = () => {
    const nextSearch = (searchInputRef.current?.value ?? searchDraft).trim()
    setSearchDraft(nextSearch)
    setSearch(nextSearch)
    void loadSchemaAndObjects(resourceId, entityTypeCode, nextSearch)
  }

  const loadProposals = useCallback(
    async (targetResourceId = resourceId, targetEntityId = selectionRef.current) => {
      if (!targetResourceId || !targetEntityId) return
      const payload = unwrap(
        await requestData({ parameters: { mode: 'proposals', resourceId: targetResourceId, entityId: targetEntityId } })
      )
      setProposals(readArray<Proposal>(payload, 'items'))
    },
    [resourceId]
  )

  const selectObject = useCallback(
    async (object: ObjectSummary) => {
      setSelectedId(object.entityId)
      selectionRef.current = object.entityId
      setBusy(true)
      setNotice('')
      try {
        const [objectPayload, proposalPayload, actionPayload] = await Promise.all([
          requestData({
            parameters: {
              mode: 'object360',
              resourceId,
              entityId: object.entityId,
              entityTypeCode: object.entityTypeCode,
              externalKey: object.externalKey,
              partitionKey: object.partitionKey ?? undefined
            }
          }),
          requestData({ parameters: { mode: 'proposals', resourceId, entityId: object.entityId } }),
          requestData({
            parameters: {
              mode: 'actions',
              resourceId,
              entityId: object.entityId,
              entityTypeCode: object.entityTypeCode,
              externalKey: object.externalKey,
              partitionKey: object.partitionKey ?? undefined
            }
          })
        ])
        const nextObject = readObject<Object360>(unwrap(objectPayload), 'object')
        if (!nextObject) throw new Error('Object 360 response is missing')
        setObject360(nextObject)
        setProposals(readArray<Proposal>(unwrap(proposalPayload), 'items'))
        setActions(readArray<ActionDescriptor>(unwrap(actionPayload), 'items'))
        setAudit([])
        await syncAssistantContext(nextObject).catch(() => undefined)
      } catch (error) {
        setNotice(readError(error, t.loadFailed))
      } finally {
        setBusy(false)
      }
    },
    [resourceId, t.loadFailed]
  )

  useEffect(() => {
    void loadResources()
  }, [loadResources])

  useEffect(() => {
    if (resourceId) void loadSchemaAndObjects(resourceId)
  }, [resourceId])

  useEffect(() => {
    window.__valveWorkbenchReload = () => void loadProposals()
    return () => {
      delete window.__valveWorkbenchReload
    }
  }, [loadProposals])

  const askAssistant = async () => {
    if (!object360) return
    await syncAssistantContext(object360).catch(() => undefined)
    await invokeClientCommand('assistant.chat.send_message', {
      text:
        `请分析当前阀门对象 ${object360.entity.label}（entityId=${object360.entity.entityId}, externalKey=${object360.entity.externalKey}, ` +
        `snapshotId=${object360.snapshotId}, graphVersion=${object360.graphVersion}）。请区分本体事实、约束风险和 Assistant 判断，并引用证据。不要创建草案，除非我随后明确要求保存建议。`
    })
  }

  const loadAudit = async (proposalId: string) => {
    const payload = unwrap(await requestData({ parameters: { mode: 'audit', resourceId, proposalId } }))
    setAudit(readArray<AuditEvent>(payload, 'items'))
    setActiveTab('audit')
  }

  const beginTransition = (proposal: Proposal, actionKey: string, status: ProposalStatus) => {
    setPendingTransition({ proposal, actionKey, status })
    setTransitionNote('')
    setDemoOutcome('success')
  }

  const createDemoProposal = async (action: ActionDescriptor) => {
    if (!object360) return
    setBusy(true)
    try {
      await executeAction('create_demo_proposal', object360.entity.entityId, {
        resourceId: object360.resourceId,
        entityTypeCode: object360.entity.entityTypeCode,
        externalKey: object360.entity.externalKey,
        partitionKey: object360.partitionKey ?? undefined,
        actionTypeCode: action.code
      })
      await loadProposals()
      setActiveTab('proposals')
      notify(t.createDemoProposal)
    } catch (error) {
      notify(readError(error, t.loadFailed), 'error')
    } finally {
      setBusy(false)
    }
  }

  const commitTransition = async () => {
    if (!pendingTransition) return
    const { actionKey, proposal } = pendingTransition
    setBusy(true)
    try {
      await executeAction(
        actionKey,
        proposal.id,
        actionKey === 'execute_demo_action'
          ? { comment: transitionNote, demoOutcome }
          : { comment: transitionNote }
      )
      notify(t.refresh)
      await loadProposals()
      if (actionKey === 'execute_demo_action' || audit.some((item) => item.proposalId === proposal.id)) {
        await loadAudit(proposal.id)
      }
      setPendingTransition(null)
      setTransitionNote('')
      setDemoOutcome('success')
    } catch (error) {
      notify(readError(error, t.loadFailed), 'error')
    } finally {
      setBusy(false)
    }
  }

  const initializeOntology = async () => {
    if (!ontologyStatus) return
    setBusy(true)
    setNotice('')
    try {
      await executeAction('initialize_valve_ontology', ontologyStatus.resourceId, {
        confirmOverwrite: Boolean(ontologyStatus.definitionId)
      })
      setOntologyConfirmOpen(false)
      notify(t.ontologyInitialized)
      await loadResources()
    } catch (error) {
      notify(readError(error, t.loadFailed), 'error')
    } finally {
      setBusy(false)
    }
  }

  const relationCount = object360?.relationGroups.reduce((sum, group) => sum + group.items.length, 0) ?? 0

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-12 min-h-12 items-center gap-2 border-b bg-background px-2">
          <div className="flex min-w-max items-center gap-2 px-1">
            <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Wrench aria-hidden className="size-4" />
            </div>
            <div className="hidden min-w-0 leading-tight xl:block">
              <strong className="block text-sm font-semibold">{t.title}</strong>
              <span className="block text-[10px] text-muted-foreground">{t.studio}</span>
            </div>
          </div>
          <Separator orientation="vertical" className="mx-1 h-6" />
          {ontologyStatus ? (
            ontologyStatus.state === 'current' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="hidden max-w-48 gap-1 truncate text-[10px] lg:inline-flex">
                    <CircleDot aria-hidden className="size-3 text-primary" />
                    {t.ontologyReady} · {ontologyStatus.semanticVersion}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{ontologyStatus.resourceId}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || ontologyStatus.state === 'publishing' || ontologyStatus.state === 'unconfigured'}
                onClick={() => setOntologyConfirmOpen(true)}
              >
                <Upload aria-hidden />
                {ontologyStatus.definitionId ? t.updateOntology : t.initializeOntology}
              </Button>
            )
          ) : null}
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger size="sm" aria-label={t.resourcePicker} className="w-[min(15rem,24vw)] min-w-32">
              <SelectValue placeholder={t.resource} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {resources.map((resource) => (
                <SelectItem key={resource.resourceId} value={resource.resourceId}>{resource.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={entityTypeCode}
            onValueChange={(value) => {
              setEntityTypeCode(value)
              void loadSchemaAndObjects(resourceId, value)
            }}
          >
            <SelectTrigger size="sm" aria-label={t.entityTypePicker} className="w-[min(11rem,18vw)] min-w-28">
              <SelectValue placeholder={t.entityType} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {(schema?.entityTypes ?? []).map((type) => (
                <SelectItem key={type.code} value={type.code}>{type.name} · {type.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form
            id="valve-object-search"
            className="min-w-36 max-w-xl flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              submitObjectSearch()
            }}
          >
            <InputGroup className="h-7">
              <InputGroupAddon><Search aria-hidden className="size-3.5" /></InputGroupAddon>
              <InputGroupInput
                ref={searchInputRef}
                aria-label={t.searchLabel}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={t.search}
                className="text-xs"
              />
            </InputGroup>
          </form>
          {schema ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="hidden max-w-48 truncate font-mono text-[10px] 2xl:inline-flex">
                  {t.snapshot} {shortId(schema.snapshotId)} · {shortId(schema.graphVersion)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{schema.snapshotId} · {schema.graphVersion}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                form="valve-object-search"
                variant="outline"
                size="icon-sm"
                data-testid="object-search-submit"
                aria-label={t.searchAction}
                disabled={busy || !resourceId}
                onClick={submitObjectSearch}
              >
                <Search aria-hidden className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.searchAction}</TooltipContent>
          </Tooltip>
        </header>

        <section
          className={cn(
            'grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200',
            objectPanelOpen ? 'grid-cols-[18rem_minmax(0,1fr)]' : 'grid-cols-[3rem_minmax(0,1fr)]'
          )}
        >
          <aside
            data-state={objectPanelOpen ? 'expanded' : 'collapsed'}
            className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground"
          >
            <div className={cn('flex h-10 min-h-10 items-center border-b', objectPanelOpen ? 'justify-between px-2' : 'justify-center')}>
              {objectPanelOpen ? (
                <div className="flex min-w-0 items-center gap-2">
                  <GitBranch aria-hidden className="size-4 text-muted-foreground" />
                  <strong className="truncate text-xs font-semibold">{t.objectNavigator}</strong>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{objects.length}</Badge>
                </div>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-testid="object-panel-toggle"
                    aria-label={objectPanelOpen ? t.collapsePanel : t.expandPanel}
                    onClick={() => setObjectPanelOpen((open) => !open)}
                  >
                    {objectPanelOpen ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{objectPanelOpen ? t.collapsePanel : t.expandPanel}</TooltipContent>
              </Tooltip>
            </div>

            <ScrollArea data-valve-scroll className="min-h-0 flex-1">
              <div className={cn('grid gap-1', objectPanelOpen ? 'p-2' : 'px-1 py-2')}>
                {objects.map((object) => (
                  <Tooltip key={object.entityId}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size={objectPanelOpen ? 'default' : 'icon-sm'}
                        aria-current={object.entityId === selectedId ? 'true' : undefined}
                        aria-label={object.label}
                        className={cn(
                          'relative text-left',
                          objectPanelOpen
                            ? 'h-auto min-h-14 w-full justify-start gap-2 whitespace-normal px-2 py-2'
                            : 'mx-auto',
                          object.entityId === selectedId && 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring/30'
                        )}
                        onClick={() => void selectObject(object)}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <Wrench aria-hidden className="size-3.5" />
                        </span>
                        {objectPanelOpen ? (
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <strong className="truncate text-xs font-medium">{object.label}</strong>
                            <small className="truncate font-mono text-[10px] text-muted-foreground">{object.externalKey}</small>
                          </span>
                        ) : null}
                        {object.constraintRefs.length ? (
                          <Badge
                            variant="destructive"
                            className={cn('h-4 min-w-4 px-1 text-[9px]', !objectPanelOpen && 'absolute -right-0.5 -top-0.5')}
                          >
                            {object.constraintRefs.length}
                          </Badge>
                        ) : null}
                      </Button>
                    </TooltipTrigger>
                    {!objectPanelOpen ? <TooltipContent side="right">{object.label}</TooltipContent> : null}
                  </Tooltip>
                ))}
                {!busy && !objects.length && objectPanelOpen ? (
                  <EmptyState icon={<Box aria-hidden />} label={t.noObjects} compact />
                ) : null}
              </div>
            </ScrollArea>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-muted/20">
            {notice ? (
              <div role="alert" className="flex min-h-9 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 text-xs text-destructive">
                <AlertTriangle aria-hidden className="size-4" />
                <span className="truncate">{notice}</span>
              </div>
            ) : null}
            {!resources.length && ontologyStatus ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="mx-auto w-full max-w-2xl">
                  <Section
                    title={t.ontologyInitialization}
                    actions={
                      <Button
                        size="sm"
                        disabled={busy || ontologyStatus.state === 'publishing' || ontologyStatus.state === 'unconfigured'}
                        onClick={() => setOntologyConfirmOpen(true)}
                      >
                        <Upload aria-hidden />
                        {ontologyStatus.definitionId ? t.updateOntology : t.initializeOntology}
                      </Button>
                    }
                  >
                    <div className="grid gap-4 rounded-lg border border-dashed bg-background p-5">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench aria-hidden className="size-5" /></span>
                        <div className="grid gap-1">
                          <strong className="text-sm">{t.ontologyUnavailable}</strong>
                          <span className="text-xs text-muted-foreground">{t.ontologyContents}</span>
                        </div>
                      </div>
                      <dl className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
                        <div className="bg-background px-3 py-2"><dt className="text-[10px] text-muted-foreground">Schema</dt><dd className="m-0 text-sm font-semibold">{ontologyStatus.counts.entityTypes} + {ontologyStatus.counts.relationTypes}</dd></div>
                        <div className="bg-background px-3 py-2"><dt className="text-[10px] text-muted-foreground">Actions</dt><dd className="m-0 text-sm font-semibold">{ontologyStatus.counts.actionTypes}</dd></div>
                        <div className="bg-background px-3 py-2"><dt className="text-[10px] text-muted-foreground">Demo data</dt><dd className="m-0 text-sm font-semibold">{ontologyStatus.counts.instances} + {ontologyStatus.counts.relations}</dd></div>
                      </dl>
                    </div>
                  </Section>
                </div>
              </div>
            ) : !object360 ? (
              <div className="grid min-h-0 flex-1 place-items-center p-6">
                <EmptyState icon={<Wrench aria-hidden />} label={t.selectObject} />
              </div>
            ) : (
              <>
                <div className="flex min-h-14 items-center gap-3 border-b bg-background px-3 py-2">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Wrench aria-hidden className="size-4" />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <strong className="truncate text-sm font-semibold">{object360.entity.label}</strong>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {object360.entity.entityTypeCode} · {object360.entity.externalKey}
                    </span>
                  </div>
                  <Badge variant="outline" className="hidden sm:inline-flex">{relationCount} {t.relationCount}</Badge>
                  <Button size="sm" onClick={() => void askAssistant()}>
                    <WandSparkles aria-hidden />
                    {t.analyze}
                  </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-10 overflow-x-auto border-b bg-background px-2">
                    <TabsList className="h-10 min-w-max justify-start rounded-none bg-transparent p-0">
                      <TabsTrigger value="overview" className="h-8"><CircleDot aria-hidden />{t.overview}</TabsTrigger>
                      <TabsTrigger value="relations" className="h-8"><GitBranch aria-hidden />{t.relations}</TabsTrigger>
                      <TabsTrigger value="evidence" className="h-8"><FileText aria-hidden />{t.evidence}</TabsTrigger>
                      <TabsTrigger value="constraints" className="h-8"><AlertTriangle aria-hidden />{t.constraints}</TabsTrigger>
                      <TabsTrigger value="actions" className="h-8"><Wrench aria-hidden />{t.actions}</TabsTrigger>
                      <TabsTrigger value="proposals" className="h-8"><ClipboardList aria-hidden />{t.proposals}</TabsTrigger>
                      <TabsTrigger value="audit" className="h-8"><History aria-hidden />{t.audit}</TabsTrigger>
                    </TabsList>
                  </div>
                  <ScrollArea data-valve-scroll className="min-h-0 flex-1">
                    <div className="mx-auto w-full max-w-6xl p-3">
                      <TabsContent value="overview" className="mt-0 grid gap-3">
                        <Section title={t.attributes}><KeyValueGrid value={object360.entity.attributes} locale={locale} /></Section>
                        <Section title={t.relatedObjects}>
                          <div className="divide-y overflow-hidden rounded-lg border">
                            {object360.relatedObjects.map((item) => <ObjectListItem key={item.entityId} object={item} />)}
                          </div>
                        </Section>
                      </TabsContent>
                      <TabsContent value="relations" className="mt-0"><Relations object={object360} empty={t.noData} /></TabsContent>
                      <TabsContent value="evidence" className="mt-0"><Section title={t.evidence}><FieldValueDisplay value={object360.evidence} locale={locale} empty={t.noData} /></Section></TabsContent>
                      <TabsContent value="constraints" className="mt-0"><Constraints object={object360} title={t.constraints} empty={t.noData} /></TabsContent>
                      <TabsContent value="actions" className="mt-0">
                        <ActionCenter items={actions} t={t} onCreate={(action) => void createDemoProposal(action)} />
                      </TabsContent>
                      <TabsContent value="proposals" className="mt-0">
                        <Proposals
                          items={proposals}
                          t={t}
                          locale={locale}
                          onAudit={(proposal) => void loadAudit(proposal.id)}
                          onTransition={beginTransition}
                        />
                      </TabsContent>
                      <TabsContent value="audit" className="mt-0"><Audit items={audit} title={t.audit} empty={t.noData} /></TabsContent>
                    </div>
                  </ScrollArea>
                </Tabs>
              </>
            )}
          </section>
        </section>

        <AlertDialog open={ontologyConfirmOpen} onOpenChange={(open) => !busy && setOntologyConfirmOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{ontologyStatus?.definitionId ? t.updateConfirm : t.initializeConfirm}</AlertDialogTitle>
              <AlertDialogDescription>
                {ontologyStatus?.definitionId ? t.overwriteDescription : t.initializeDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {ontologyStatus ? (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t.ontologyVersion}</span><strong>{ontologyStatus.semanticVersion}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Resource ID</span><code>{ontologyStatus.resourceId}</code></div>
                <Separator />
                <p className="m-0 text-muted-foreground">{t.ontologyContents}</p>
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} variant="outline" size="default">{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                variant="default"
                size="default"
                onClick={(event) => {
                  event.preventDefault()
                  void initializeOntology()
                }}
              >
                {busy ? <RefreshCw aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
                {t.initializeNow}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(pendingTransition)}
          onOpenChange={(open) => {
            if (!open && !busy) {
              setPendingTransition(null)
              setTransitionNote('')
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pendingTransition?.actionKey === 'execute_demo_action' ? t.executeConfirm : t.confirm}</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingTransition?.actionKey === 'execute_demo_action' ? t.executeDescription : t.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {pendingTransition?.actionKey === 'execute_demo_action' ? (
              <div className="grid gap-2">
                <span className="text-xs font-medium">{t.demoOutcome}</span>
                <div role="group" aria-label={t.demoOutcome} className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={demoOutcome === 'success' ? 'default' : 'outline'}
                    aria-pressed={demoOutcome === 'success'}
                    onClick={() => setDemoOutcome('success')}
                  >
                    {t.successPath}
                  </Button>
                  <Button
                    type="button"
                    variant={demoOutcome === 'failure' ? 'destructive' : 'outline'}
                    aria-pressed={demoOutcome === 'failure'}
                    onClick={() => setDemoOutcome('failure')}
                  >
                    {t.failurePath}
                  </Button>
                </div>
                <div className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-xs">
                  {t.noExternalWrite}
                </div>
              </div>
            ) : null}
            <Textarea
              aria-label={t.optionalNote}
              placeholder={t.optionalNote}
              value={transitionNote}
              onChange={(event) => setTransitionNote(event.target.value)}
              className="min-h-20 text-sm"
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} variant="outline" size="default">{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                size="default"
                variant={pendingTransition?.status === 'rejected' ? 'destructive' : 'default'}
                onClick={(event) => {
                  event.preventDefault()
                  void commitTransition()
                }}
              >
                {busy ? <RefreshCw aria-hidden className="animate-spin" /> : null}
                {t.continue}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {busy ? <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"><RefreshCw aria-hidden className="size-3.5 animate-spin" />{t.loading}</div> : null}
      </main>
    </TooltipProvider>
  )
}

function Section({ title, actions, children }: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section data-section-layout="title-actions-divider-content" className="min-w-0">
      <header className="flex min-h-10 items-center justify-between gap-3 px-1 py-2">
        <h2 className="m-0 text-xs font-semibold">{title}</h2>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      <Separator />
      <div className="pt-3">{children}</div>
    </section>
  )
}

function KeyValueGrid({ value, locale }: { value: Record<string, unknown>; locale: SupportedLocale }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(value).map(([key, item]) => (
        <div key={key} className="grid min-w-0 gap-1 bg-background px-3 py-2">
          <dt className="truncate text-[10px] font-medium tracking-wide text-muted-foreground" title={key}>{fieldLabel(locale, key)}</dt>
          <dd className="m-0 break-words text-xs font-medium">{formatValue(item, locale)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ObjectListItem({ object }: { object: Object360['relatedObjects'][number] }) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-background px-3 py-2.5">
      <Badge variant="secondary" className="shrink-0">{object.entityTypeCode}</Badge>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <strong className="truncate text-xs font-medium">{object.label}</strong>
        <small className="truncate font-mono text-[10px] text-muted-foreground">{object.externalKey}</small>
      </div>
    </div>
  )
}

function ActionCenter({ items, t, onCreate }: { items: ActionDescriptor[]; t: Copy; onCreate: (action: ActionDescriptor) => void }) {
  if (!items.length) return <EmptyState icon={<Wrench aria-hidden />} label={t.noData} />
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
        <div className="grid gap-0.5">
          <strong className="text-xs">{t.demoMode}</strong>
          <span className="text-[10px] text-muted-foreground">{t.noExternalWrite}</span>
        </div>
        <Badge variant="outline">Demo</Badge>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((action) => (
          <Card key={action.code} size="sm" className="gap-0 overflow-hidden">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={action.riskLevel === 'HIGH' || action.riskLevel === 'CRITICAL' ? 'destructive' : 'secondary'}>
                  {action.riskLevel}
                </Badge>
                <Badge variant="outline">{action.source === 'ontology' ? t.ontologySource : t.demoSource}</Badge>
                <Badge variant="outline">{action.executionMode}</Badge>
              </div>
              <CardTitle>{action.name}</CardTitle>
              <CardDescription>{action.description}</CardDescription>
              <small className="font-mono text-[10px] text-muted-foreground">{action.code}</small>
            </CardHeader>
            <CardContent className="grid gap-3 pt-3">
              <div className="grid gap-1 text-xs">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.targetSystem}</span>
                <span>{action.targetSystem}</span>
              </div>
              {action.preconditions.length ? <CompactList title={t.preconditions} items={action.preconditions} /> : null}
              {action.inputFields.length ? (
                <CompactList
                  title={t.actionInput}
                  items={action.inputFields.map((field) => `${field.label}${field.required ? ' *' : ''}${field.defaultValue === undefined ? '' : ` · ${String(field.defaultValue)}`}`)}
                />
              ) : null}
              {action.expectedEffects.length ? <CompactList title={t.expectedEffects} items={action.expectedEffects} /> : null}
              {action.blockingReasons.length ? <CompactList title={t.blockingReasons} items={action.blockingReasons} destructive /> : null}
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-[10px] text-muted-foreground">
                  {action.available ? t.adapterReady : t.unavailable}
                </span>
                <Button size="sm" disabled={!action.available} onClick={() => onCreate(action)}>
                  <ClipboardList aria-hidden />
                  {t.createDemoProposal}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function CompactList({ title, items, destructive = false }: { title: string; items: string[]; destructive?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className={cn('text-[10px] font-medium uppercase tracking-wide text-muted-foreground', destructive && 'text-destructive')}>{title}</span>
      <ul className="m-0 grid gap-1 pl-4 text-xs text-muted-foreground">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

function Relations({ object, empty }: { object: Object360; empty: string }) {
  if (!object.relationGroups.length) return <EmptyState icon={<GitBranch aria-hidden />} label={empty} />
  return (
    <div className="grid gap-3">
      {object.relationGroups.map((group) => (
        <Section key={`${group.relationTypeCode}:${group.direction}`} title={`${group.relationTypeCode} · ${group.direction}`}>
          <div className="divide-y rounded-lg border">
            {group.items.map((item) => (
              <div key={item.relationId} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="truncate font-medium">{item.relatedEntityLabel}</span>
                <small className="truncate font-mono text-[10px] text-muted-foreground">{item.relatedEntityTypeCode} · {item.relatedEntityExternalKey}</small>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

function Constraints({ object, title, empty }: { object: Object360; title: string; empty: string }) {
  if (!object.constraints.length) return <EmptyState icon={<AlertTriangle aria-hidden />} label={empty} />
  return (
    <Section title={title}>
      <div className="divide-y overflow-hidden rounded-lg border">
        {object.constraints.map((item) => (
          <article key={item.code} className="flex gap-3 bg-background px-3 py-3">
            <AlertTriangle aria-hidden className={cn('mt-0.5 size-4 shrink-0', item.severity === 'error' ? 'text-destructive' : 'text-[var(--warning)]')} />
            <div className="grid min-w-0 gap-1">
              <div className="flex items-center gap-2"><strong className="text-xs">{item.code}</strong><Badge variant={item.severity === 'error' ? 'destructive' : 'secondary'}>{item.severity}</Badge></div>
              <p className="m-0 text-xs text-muted-foreground">{item.summary}</p>
              {item.shapeRef ? <small className="truncate font-mono text-[10px] text-muted-foreground">{item.shapeRef}</small> : null}
            </div>
          </article>
        ))}
      </div>
    </Section>
  )
}

function Proposals({ items, t, locale, onAudit, onTransition }: {
  items: Proposal[]
  t: Copy
  locale: SupportedLocale
  onAudit: (proposal: Proposal) => void
  onTransition: (proposal: Proposal, action: string, status: ProposalStatus) => void
}) {
  if (!items.length) return <EmptyState icon={<ClipboardList aria-hidden />} label={t.noData} />
  return (
    <div className="grid gap-3">
      {items.map((proposal) => (
        <Card key={proposal.id} size="sm">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={proposal.status === 'pending_review' ? 'destructive' : 'secondary'}>{t[proposal.status]}</Badge>
              <Badge variant="outline">{t[proposal.kind]}</Badge>
              <span className="ml-auto text-[10px] text-muted-foreground">{new Date(proposal.createdAt).toLocaleString()}</span>
            </div>
            <CardTitle>{proposal.title}</CardTitle>
            <CardDescription>{proposal.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {proposal.expectedEffects.length ? (
              <ul className="m-0 grid gap-1 pl-4 text-xs text-muted-foreground">
                {proposal.expectedEffects.map((effect) => <li key={effect}>{effect}</li>)}
              </ul>
            ) : null}
            {proposal.actionInput && Object.keys(proposal.actionInput).length ? (
              <div className="grid gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.actionInput}</span>
                <KeyValueGrid value={proposal.actionInput} locale={locale} />
              </div>
            ) : null}
            {proposal.outcome ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <strong className="mr-2">{t.outcome}</strong>{proposal.outcome}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => onAudit(proposal)}><History aria-hidden />{t.audit}</Button>
              {proposal.status === 'pending_review' ? (
                <>
                  <Button size="sm" onClick={() => onTransition(proposal, 'approve_proposal', 'approved')}>{t.approve}</Button>
                  <Button variant="destructive" size="sm" onClick={() => onTransition(proposal, 'reject_proposal', 'rejected')}>{t.reject}</Button>
                </>
              ) : null}
              {proposal.status === 'approved' ? (
                <Button size="sm" onClick={() => onTransition(proposal, 'execute_demo_action', 'completed')}>
                  <WandSparkles aria-hidden />{t.executeDemo}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Audit({ items, title, empty }: { items: AuditEvent[]; title: string; empty: string }) {
  if (!items.length) return <EmptyState icon={<History aria-hidden />} label={empty} />
  return (
    <Section title={title}>
      <div className="relative divide-y pl-5 before:absolute before:bottom-3 before:left-[6px] before:top-3 before:w-px before:bg-border">
        {items.map((item) => (
          <article key={item.id} className="relative grid gap-2 py-3 first:pt-0 last:pb-0">
            <span className="absolute -left-5 top-3 grid size-3 place-items-center rounded-full bg-background ring-1 ring-border first:top-0"><span className="size-1.5 rounded-full bg-primary" /></span>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.source}</Badge><strong className="text-xs">{item.eventType}</strong></div>
            {item.comment ? <p className="m-0 text-xs text-muted-foreground">{item.comment}</p> : null}
            {item.payload && Object.keys(item.payload).length ? (
              <pre className="m-0 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            ) : null}
            <small className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()} · {item.actorId ?? 'system'}</small>
          </article>
        ))}
      </div>
    </Section>
  )
}

function FieldValueDisplay({ value, locale, empty }: { value: Record<string, unknown>; locale: SupportedLocale; empty: string }) {
  return Object.keys(value).length
    ? <KeyValueGrid value={value} locale={locale} />
    : <EmptyState icon={<FileText aria-hidden />} label={empty} compact />
}

function EmptyState({ icon, label, compact = false }: { icon: React.ReactNode; label: string; compact?: boolean }) {
  return (
    <div className={cn('grid place-items-center gap-2 rounded-lg border border-dashed text-center text-muted-foreground', compact ? 'p-4 text-xs' : 'min-h-40 p-8 text-sm')}>
      <span className={cn('grid place-items-center rounded-full bg-muted', compact ? 'size-8' : 'size-10', '[&_svg]:size-4')}>{icon}</span>
      <span>{label}</span>
    </div>
  )
}

function unwrap(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const meta = record['meta']
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) return meta as Record<string, unknown>
    return record
  }
  return {}
}

function readArray<T>(value: Record<string, unknown>, key: string): T[] {
  return Array.isArray(value[key]) ? (value[key] as T[]) : []
}

function readObject<T>(value: Record<string, unknown>, key: string): T | null {
  const candidate = value[key]
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? (candidate as T) : null
}

function readInitialParameter(context: HostContext, key: string) {
  const value = context.initialQuery?.parameters?.[key]
  return typeof value === 'string' ? value : ''
}

function formatValue(value: unknown, locale: SupportedLocale): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return locale === 'zh_Hans' ? (value ? '是' : '否') : (value ? 'Yes' : 'No')
  if (Array.isArray(value)) return value.map((item) => formatValue(item, locale)).join('、') || '—'
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${fieldLabel(locale, key)}：${formatValue(item, locale)}`)
      .join('；') || '—'
  }
  return String(value)
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function readError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
