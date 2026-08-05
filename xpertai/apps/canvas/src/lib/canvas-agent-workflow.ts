import { BadRequestException } from '@nestjs/common'
import { generateKeyBetween } from 'fractional-indexing'
import type {
  CanvasAgentShapeColor,
  CanvasAgentShapeFill,
  CanvasRecord,
  CreateCanvasAgentShapeInput,
  CreateCanvasWorkflowInput
} from './types.js'
import { createCanvasAgentShapeRecords } from './canvas-agent-shapes.js'

const DEFAULT_PAGE_ID = 'page:page'
const BOARD_WIDTH = 1_600
const BOARD_MARGIN = 80
const CONTENT_RIGHT = 1_280
const STAGE_TOP = 280
const STAGE_HEIGHT = 150
const BRANCH_TOP = 560
const BRANCH_HEIGHT = 120

export function prepareCanvasWorkflow(
  store: Record<string, CanvasRecord>,
  workflow: CreateCanvasWorkflowInput
) {
  const pageId = resolveWorkflowPage(store, workflow.pageId)
  const removedRecordIds = workflow.mode === 'replace_page' ? clearWorkflowPage(store, pageId) : []
  const originY = workflow.mode === 'append' ? pageContentBottom(store, pageId) + 160 : 0
  const inputs = compileWorkflowShapes(workflow, pageId, originY)
  const records = createCanvasAgentShapeRecords(store, inputs)
  return {
    pageId,
    createdRecordIds: records.map((record) => record.id),
    removedRecordIds
  }
}

export function compileWorkflowShapes(
  workflow: CreateCanvasWorkflowInput,
  pageId: string,
  originY = 0
): CreateCanvasAgentShapeInput[] {
  const dark = (workflow.theme ?? 'xpert-dark') === 'xpert-dark'
  const boardHeight = workflow.branches?.length ? 860 : 650
  const stageGap = workflow.stages.length > 6 ? 24 : 36
  // Reserve the right-side gutter for tldraw's floating style panel.
  const availableWidth = CONTENT_RIGHT - BOARD_MARGIN
  const stageWidth = Math.min(280, (availableWidth - stageGap * (workflow.stages.length - 1)) / workflow.stages.length)
  const stageRowWidth = stageWidth * workflow.stages.length + stageGap * (workflow.stages.length - 1)
  const stageStartX = BOARD_MARGIN + (availableWidth - stageRowWidth) / 2
  const stages = workflow.stages.map((stage, index) => ({
    ...stage,
    x: stageStartX + index * (stageWidth + stageGap),
    y: originY + STAGE_TOP,
    width: stageWidth,
    height: STAGE_HEIGHT
  }))
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]))
  const branches = workflow.branches ?? []
  const branchGap = branches.length > 6 ? 16 : 24
  const branchWidth = branches.length
    ? Math.min(230, (availableWidth - branchGap * (branches.length - 1)) / branches.length)
    : 0
  const branchRowWidth = branchWidth * branches.length + branchGap * Math.max(0, branches.length - 1)
  const branchStartX = BOARD_MARGIN + (availableWidth - branchRowWidth) / 2
  const laidOutBranches = branches.map((branch, index) => ({
    ...branch,
    x: branchStartX + index * (branchWidth + branchGap),
    y: originY + BRANCH_TOP,
    width: branchWidth,
    height: BRANCH_HEIGHT
  }))

  const inputs: CreateCanvasAgentShapeInput[] = [
    geo(pageId, 0, originY, BOARD_WIDTH, boardHeight, '', dark ? 'black' : 'white', dark ? 'white' : 'black', true, 'fill'),
    text(pageId, BOARD_MARGIN, originY + 58, 900, workflow.title, dark ? 'white' : 'black', 'xl'),
    ...(workflow.subtitle
      ? [text(pageId, BOARD_MARGIN, originY + 126, 900, workflow.subtitle, dark ? 'grey' : 'black', 'm')]
      : []),
    geo(pageId, BOARD_MARGIN, originY + 194, 128, 8, '', 'blue', 'white', false, 'fill'),
    geo(pageId, 1_040, originY + 64, 240, 52, 'XPERTAI  /  WORKFLOW', 'blue', 'white', false, 'fill'),
    ...stages.map((stage, index) => geo(
      pageId,
      stage.x,
      stage.y,
      stage.width,
      stage.height,
      workflowCardText(index + 1, stage.label, stage.detail),
      stage.emphasis ? 'blue' : 'light-blue',
      stage.emphasis ? 'white' : 'black',
      false,
      stage.emphasis ? 'fill' : 'solid',
      workflow.stages.length <= 5 ? 'l' : 'm'
    )),
    ...laidOutBranches.map((branch) => geo(
      pageId,
      branch.x,
      branch.y,
      branch.width,
      branch.height,
      workflowCardText(null, branch.label, branch.detail),
      'light-green',
      'black'
    )),
    ...stages.slice(0, -1).map((stage, index) => arrow(
      pageId,
      { x: stage.x + stage.width, y: stage.y + stage.height / 2 },
      { x: stages[index + 1].x, y: stages[index + 1].y + stages[index + 1].height / 2 },
      dark ? 'white' : 'black'
    )),
    ...laidOutBranches.map((branch) => {
      const parent = stageByKey.get(branch.parentStageKey)
      if (!parent) throw new BadRequestException(`Workflow branch ${branch.key} references unknown stage ${branch.parentStageKey}.`)
      return arrow(
        pageId,
        { x: parent.x + parent.width / 2, y: parent.y + parent.height },
        { x: branch.x + branch.width / 2, y: branch.y },
        dark ? 'light-green' : 'green'
      )
    }),
    text(
      pageId,
      BOARD_MARGIN,
      originY + boardHeight - 54,
      BOARD_WIDTH - BOARD_MARGIN * 2,
      workflow.footer ?? 'Editable workflow canvas · Generated with deterministic layout',
      dark ? 'grey' : 'black',
      's'
    )
  ]

  return inputs
}

function resolveWorkflowPage(store: Record<string, CanvasRecord>, requestedPageId?: string) {
  if (requestedPageId) {
    const page = store[requestedPageId]
    if (!page || page.typeName !== 'page') {
      throw new BadRequestException(`[CANVAS_WORKFLOW_PAGE_NOT_FOUND] ${requestedPageId} is not an existing page.`)
    }
    return requestedPageId
  }
  const pageIds = Object.values(store).filter((record) => record.typeName === 'page').map((record) => record.id)
  if (pageIds.length > 1) {
    throw new BadRequestException(`[CANVAS_WORKFLOW_PAGE_REQUIRED] Canvas has ${pageIds.length} pages. Pass workflow.pageId.`)
  }
  if (pageIds.length === 1) return pageIds[0]
  if (store[DEFAULT_PAGE_ID]) {
    throw new BadRequestException(`[CANVAS_DEFAULT_PAGE_CONFLICT] Record ${DEFAULT_PAGE_ID} exists but is not a page.`)
  }
  store[DEFAULT_PAGE_ID] = {
    id: DEFAULT_PAGE_ID,
    typeName: 'page',
    name: 'Page 1',
    index: generateKeyBetween(null, null),
    meta: {}
  }
  return DEFAULT_PAGE_ID
}

function clearWorkflowPage(store: Record<string, CanvasRecord>, pageId: string) {
  const shapeIds = new Set(Object.values(store)
    .filter((record) => record.typeName === 'shape' && belongsToPage(store, record, pageId))
    .map((record) => record.id))
  const assetIds = new Set<string>()
  for (const shapeId of shapeIds) {
    const assetId = store[shapeId]?.props?.assetId
    if (typeof assetId === 'string') assetIds.add(assetId)
  }
  const bindingIds = Object.values(store)
    .filter((record) => record.typeName === 'binding' && (shapeIds.has(String(record.fromId)) || shapeIds.has(String(record.toId))))
    .map((record) => record.id)
  const retainedAssetIds = new Set(Object.values(store)
    .filter((record) => record.typeName === 'shape' && !shapeIds.has(record.id))
    .flatMap((record) => typeof record.props?.assetId === 'string' ? [record.props.assetId] : []))
  const removableAssetIds = [...assetIds].filter((assetId) => !retainedAssetIds.has(assetId))
  const ids = [...shapeIds, ...bindingIds, ...removableAssetIds]
  for (const id of ids) delete store[id]
  return ids
}

function belongsToPage(store: Record<string, CanvasRecord>, record: CanvasRecord, pageId: string) {
  let current: CanvasRecord | undefined = record
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.id === pageId || current.parentId === pageId) return true
    current = typeof current.parentId === 'string' ? store[current.parentId] : undefined
  }
  return false
}

function pageContentBottom(store: Record<string, CanvasRecord>, pageId: string) {
  let bottom = 0
  for (const record of Object.values(store)) {
    if (record.typeName !== 'shape' || !belongsToPage(store, record, pageId)) continue
    const y = finite(record.y)
    if (record.type === 'arrow') {
      const end = record.props?.end
      const endY = finite(end && !Array.isArray(end) && typeof end === 'object' ? end.y : 0)
      bottom = Math.max(bottom, y, y + endY)
    } else {
      bottom = Math.max(bottom, y + finite(record.props?.h))
    }
  }
  return bottom
}

function workflowCardText(sequence: number | null, label: string, detail?: string) {
  const heading = sequence === null ? label : `${String(sequence).padStart(2, '0')}  ${label}`
  return detail ? `${heading}\n${detail}` : heading
}

function geo(
  parentId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string,
  color: CanvasAgentShapeColor,
  labelColor: CanvasAgentShapeColor,
  isLocked = false,
  fill: CanvasAgentShapeFill = 'solid',
  size: 's' | 'm' | 'l' | 'xl' = 'm'
): CreateCanvasAgentShapeInput {
  return {
    type: 'geo', parentId, x, y, width, height, text: value, color, labelColor,
    fill, dash: 'solid', size, font: 'sans', align: 'middle', verticalAlign: 'middle', isLocked
  }
}

function text(
  parentId: string,
  x: number,
  y: number,
  width: number,
  value: string,
  color: CanvasAgentShapeColor,
  size: 's' | 'm' | 'xl'
): CreateCanvasAgentShapeInput {
  return {
    type: 'text', parentId, x, y, width, text: value, color, size, font: 'sans', textAlign: 'start', autoSize: false
  }
}

function arrow(
  parentId: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: CanvasAgentShapeColor
): CreateCanvasAgentShapeInput {
  return {
    type: 'arrow', parentId, start, end, color, labelColor: color, dash: 'solid', size: 'm', arrowheadEnd: 'arrow'
  }
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
