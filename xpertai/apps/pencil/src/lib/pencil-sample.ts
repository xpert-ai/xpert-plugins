import type { Color, Effect, Fill, GridTrack, SceneGraph, SceneNode, Stroke } from '@open\u002dpencil/core/scene-graph'
import { snapshotFromGraph } from './pencil-graph.js'
import type { PencilGraphSnapshot, PencilJsonObject } from './types.js'

export type PencilSampleGraphRuntime = {
  SceneGraph: new () => SceneGraph
  computeAllLayouts?: (graph: SceneGraph, scopeId?: string) => void
}

export type PencilSampleGraphResult = {
  graphSnapshot: PencilGraphSnapshot
  viewState: PencilJsonObject
  selectionSummary: PencilJsonObject
}

/**
 * Builds a deterministic, persisted dashboard case that exercises nested layout,
 * wrapping, grid, fill/hug sizing, and absolute positioning in one document.
 */
export function createPencilDataCaseGraph(runtime: PencilSampleGraphRuntime): PencilSampleGraphResult {
  const graph = new runtime.SceneGraph()
  graph.documentColorSpace = 'display-p3'

  const page = graph.getPages(true)[0] ?? graph.addPage('Revenue Ops Case')
  graph.updateNode(page.id, {
    name: 'Revenue Ops Case',
    width: 1600,
    height: 1160
  })

  const shell = createFrame(graph, page.id, 'Revenue Intelligence Dashboard', {
    x: 80,
    y: 72,
    width: 1440,
    height: 1024,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    counterAxisAlign: 'STRETCH',
    itemSpacing: 24,
    paddingTop: 32,
    paddingRight: 32,
    paddingBottom: 32,
    paddingLeft: 32,
    fills: solid('#f7f8fb'),
    strokes: stroke('#d8dee8'),
    effects: shadow('#0f172a', 0.12, 0, 24, 48),
    cornerRadius: 28,
    clipsContent: false
  })

  createHeader(graph, shell.id)
  createKpiRow(graph, shell.id)
  createInsightGrid(graph, shell.id)

  runtime.computeAllLayouts?.(graph, page.id)

  return {
    graphSnapshot: snapshotFromGraph(graph),
    viewState: {
      viewport: {
        center: { x: 800, y: 584 },
        zoom: 0.62
      },
      selectedNodeIds: [shell.id],
      sampleCase: 'revenue-ops-dashboard'
    },
    selectionSummary: {
      selectedNodeIds: [shell.id],
      selectedNodeName: shell.name,
      sampleCase: 'revenue-ops-dashboard',
      layoutNotes: 'Nested vertical, horizontal, wrapping, grid, fill, hug, grow, stretch, and absolute-positioned nodes.'
    }
  }
}

function createHeader(graph: SceneGraph, parentId: string) {
  const header = createFrame(graph, parentId, 'Header / project controls', {
    width: 1320,
    height: 72,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'FIXED',
    primaryAxisAlign: 'MIN',
    counterAxisAlign: 'CENTER',
    itemSpacing: 18,
    fills: [],
    layoutAlignSelf: 'STRETCH'
  })

  const mark = createFrame(graph, header.id, 'Product mark', {
    width: 48,
    height: 48,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    fills: solid('#2563eb'),
    cornerRadius: 14
  })
  createText(graph, mark.id, 'P mark', 'P', { fontSize: 22, fontWeight: 760, fills: solid('#ffffff'), width: 18, height: 28 })

  const titleStack = createFrame(graph, header.id, 'Title stack', {
    width: 420,
    height: 56,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG',
    itemSpacing: 4,
    fills: []
  })
  createText(graph, titleStack.id, 'Dashboard title', 'Revenue Intelligence Dashboard', {
    fontSize: 24,
    fontWeight: 760,
    lineHeight: 30,
    width: 360,
    height: 32,
    fills: solid('#111827')
  })
  createText(graph, titleStack.id, 'Dashboard subtitle', 'Live pipeline, retention, activation, and support health for Q3 planning', {
    fontSize: 13,
    lineHeight: 18,
    width: 520,
    height: 20,
    fills: solid('#64748b')
  })

  createFrame(graph, header.id, 'Header spacer', {
    width: 1,
    height: 1,
    layoutGrow: 1,
    layoutAlignSelf: 'STRETCH',
    fills: []
  })

  createPill(graph, header.id, 'Segment / Enterprise', 'Enterprise', '#eef2ff', '#3730a3')
  createPill(graph, header.id, 'Range / Last 90 days', 'Last 90 days', '#ecfeff', '#155e75')
  createPill(graph, header.id, 'Action / Share', 'Share', '#111827', '#ffffff')
}

function createKpiRow(graph: SceneGraph, parentId: string) {
  // This wrapping row is the regression fixture for counter-axis spacing and stretch behavior.
  const row = createFrame(graph, parentId, 'KPI row / wrapping auto-layout', {
    width: 1320,
    height: 156,
    layoutMode: 'HORIZONTAL',
    layoutWrap: 'WRAP',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'HUG',
    counterAxisAlign: 'STRETCH',
    counterAxisAlignContent: 'SPACE_BETWEEN',
    itemSpacing: 16,
    counterAxisSpacing: 16,
    fills: [],
    layoutAlignSelf: 'STRETCH'
  })

  createKpiCard(graph, row.id, 'MRR', '$412.8K', '+18.4%', 'Net revenue retained 121%', '#2563eb')
  createKpiCard(graph, row.id, 'Qualified pipeline', '$1.84M', '+9.7%', '64 open opportunities', '#0f766e')
  createKpiCard(graph, row.id, 'Activation', '71.2%', '+6.1%', 'Trial to weekly active', '#7c3aed')
  createKpiCard(graph, row.id, 'Gross churn', '2.9%', '-1.3%', 'Logo churn trailing month', '#db2777')
}

function createInsightGrid(graph: SceneGraph, parentId: string) {
  const grid = createFrame(graph, parentId, 'Insight grid / complex layout', {
    width: 1320,
    height: 708,
    layoutMode: 'GRID',
    layoutGrow: 1,
    layoutAlignSelf: 'STRETCH',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    gridTemplateColumns: [
      { sizing: 'FR', value: 2 },
      { sizing: 'FR', value: 1 }
    ] as GridTrack[],
    gridTemplateRows: [
      { sizing: 'FIXED', value: 356 },
      { sizing: 'FR', value: 1 }
    ] as GridTrack[],
    gridColumnGap: 20,
    gridRowGap: 20,
    fills: []
  })

  createRevenuePanel(graph, grid.id)
  createAccountPanel(graph, grid.id)
  createFunnelPanel(graph, grid.id)
}

function createRevenuePanel(graph: SceneGraph, parentId: string) {
  const panel = createCard(graph, parentId, 'Revenue by channel / grid area', {
    gridPosition: { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FILL',
    paddingTop: 22,
    paddingRight: 22,
    paddingBottom: 22,
    paddingLeft: 22,
    itemSpacing: 18
  })

  createPanelHeader(graph, panel.id, 'Revenue by channel', 'Actuals vs plan, grouped by acquisition motion')

  const chart = createFrame(graph, panel.id, 'Stacked bar chart / absolute annotation', {
    width: 780,
    height: 220,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'FIXED',
    primaryAxisAlign: 'SPACE_BETWEEN',
    counterAxisAlign: 'MAX',
    itemSpacing: 14,
    fills: solid('#f8fafc'),
    strokes: stroke('#e2e8f0'),
    cornerRadius: 18,
    paddingTop: 18,
    paddingRight: 22,
    paddingBottom: 18,
    paddingLeft: 22,
    layoutAlignSelf: 'STRETCH'
  })
  ;[
    ['Jan', 118, '#2563eb'],
    ['Feb', 136, '#06b6d4'],
    ['Mar', 152, '#7c3aed'],
    ['Apr', 129, '#0f766e'],
    ['May', 172, '#db2777'],
    ['Jun', 188, '#f59e0b']
  ].forEach(([label, height, color]) => {
    const group = createFrame(graph, chart.id, `Month ${label}`, {
      width: 86,
      height: 178,
      layoutMode: 'VERTICAL',
      primaryAxisSizing: 'FIXED',
      counterAxisSizing: 'FIXED',
      primaryAxisAlign: 'MAX',
      counterAxisAlign: 'CENTER',
      itemSpacing: 8,
      fills: []
    })
    createFrame(graph, group.id, `Bar ${label}`, {
      width: 42,
      height: Number(height),
      fills: solid(String(color)),
      cornerRadius: 12
    })
    createText(graph, group.id, `Label ${label}`, String(label), { width: 40, height: 18, fontSize: 12, fills: solid('#64748b'), textAlignHorizontal: 'CENTER' })
  })

  const annotation = createFrame(graph, chart.id, 'Absolute annotation / plan beat', {
    x: 610,
    y: 20,
    width: 156,
    height: 40,
    layoutMode: 'HORIZONTAL',
    layoutPositioning: 'ABSOLUTE',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    itemSpacing: 8,
    fills: solid('#111827'),
    effects: shadow('#0f172a', 0.22, 0, 12, 24),
    cornerRadius: 20
  })
  createText(graph, annotation.id, 'Annotation text', '+14% over plan', { width: 112, height: 18, fontSize: 12, fontWeight: 700, fills: solid('#ffffff') })

  const legend = createFrame(graph, panel.id, 'Legend row', {
    width: 780,
    height: 30,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'HUG',
    itemSpacing: 10,
    fills: [],
    layoutAlignSelf: 'STRETCH'
  })
  createLegendItem(graph, legend.id, 'Inbound', '#2563eb')
  createLegendItem(graph, legend.id, 'Partner', '#06b6d4')
  createLegendItem(graph, legend.id, 'Expansion', '#7c3aed')
}

function createAccountPanel(graph: SceneGraph, parentId: string) {
  const panel = createCard(graph, parentId, 'Account risk queue / spanning grid area', {
    gridPosition: { column: 2, row: 1, columnSpan: 1, rowSpan: 2 },
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'FILL',
    paddingTop: 22,
    paddingRight: 22,
    paddingBottom: 22,
    paddingLeft: 22,
    itemSpacing: 16,
    layoutAlignSelf: 'STRETCH',
    layoutGrow: 1
  })
  createPanelHeader(graph, panel.id, 'Account risk queue', 'Renewal exposure with playbook status')
  ;[
    ['Globex Analytics', '$226K', 'Security review', '#db2777'],
    ['Northstar Foods', '$148K', 'Usage dipped 18%', '#f59e0b'],
    ['Nimbus Finance', '$112K', 'Champion changed', '#7c3aed'],
    ['Helio Retail', '$96K', 'Expansion ready', '#0f766e']
  ].forEach(([name, value, status, color]) => {
    const row = createFrame(graph, panel.id, `Account row / ${name}`, {
      width: 360,
      height: 86,
      layoutMode: 'HORIZONTAL',
      primaryAxisSizing: 'FILL',
      counterAxisSizing: 'FIXED',
      counterAxisAlign: 'CENTER',
      itemSpacing: 12,
      paddingTop: 14,
      paddingRight: 14,
      paddingBottom: 14,
      paddingLeft: 14,
      fills: solid('#f8fafc'),
      strokes: stroke('#e2e8f0'),
      cornerRadius: 16,
      layoutAlignSelf: 'STRETCH'
    })
    createFrame(graph, row.id, `Risk dot / ${name}`, { width: 12, height: 12, fills: solid(String(color)), cornerRadius: 99 })
    const copy = createFrame(graph, row.id, `Account copy / ${name}`, {
      width: 210,
      height: 56,
      layoutMode: 'VERTICAL',
      primaryAxisSizing: 'HUG',
      counterAxisSizing: 'FILL',
      itemSpacing: 4,
      fills: [],
      layoutGrow: 1
    })
    createText(graph, copy.id, `Account name / ${name}`, String(name), { width: 190, height: 20, fontSize: 14, fontWeight: 700, fills: solid('#111827') })
    createText(graph, copy.id, `Account status / ${name}`, String(status), { width: 190, height: 18, fontSize: 12, fills: solid('#64748b') })
    createText(graph, row.id, `Account value / ${name}`, String(value), { width: 68, height: 20, fontSize: 14, fontWeight: 760, fills: solid('#111827'), textAlignHorizontal: 'RIGHT' })
  })
}

function createFunnelPanel(graph: SceneGraph, parentId: string) {
  const panel = createCard(graph, parentId, 'Conversion funnel / responsive table', {
    gridPosition: { column: 1, row: 2, columnSpan: 1, rowSpan: 1 },
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FILL',
    paddingTop: 22,
    paddingRight: 22,
    paddingBottom: 22,
    paddingLeft: 22,
    itemSpacing: 16,
    layoutAlignSelf: 'STRETCH'
  })
  createPanelHeader(graph, panel.id, 'Conversion funnel', 'Observed movement from site visit to closed won')

  const table = createFrame(graph, panel.id, 'Funnel table', {
    width: 780,
    height: 250,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'FILL',
    itemSpacing: 8,
    fills: [],
    layoutAlignSelf: 'STRETCH',
    layoutGrow: 1
  })
  ;[
    ['Visitors', '48,210', '100%', '#2563eb'],
    ['Trials', '5,436', '11.3%', '#06b6d4'],
    ['Qualified', '1,184', '21.8%', '#7c3aed'],
    ['Closed won', '318', '26.9%', '#0f766e']
  ].forEach(([stage, count, rate, color], index) => {
    const row = createFrame(graph, table.id, `Funnel row / ${stage}`, {
      width: 780,
      height: 52,
      layoutMode: 'HORIZONTAL',
      primaryAxisSizing: 'FILL',
      counterAxisSizing: 'FIXED',
      counterAxisAlign: 'CENTER',
      itemSpacing: 14,
      paddingTop: 10,
      paddingRight: 12,
      paddingBottom: 10,
      paddingLeft: 12,
      fills: solid(index % 2 === 0 ? '#ffffff' : '#f8fafc'),
      cornerRadius: 12,
      layoutAlignSelf: 'STRETCH'
    })
    createFrame(graph, row.id, `Funnel swatch / ${stage}`, { width: 12, height: 32, fills: solid(String(color)), cornerRadius: 8 })
    createText(graph, row.id, `Funnel stage / ${stage}`, String(stage), { width: 260, height: 20, fontSize: 13, fontWeight: 700, fills: solid('#111827'), layoutGrow: 1 })
    createText(graph, row.id, `Funnel count / ${stage}`, String(count), { width: 92, height: 20, fontSize: 13, fontWeight: 700, fills: solid('#111827'), textAlignHorizontal: 'RIGHT' })
    createText(graph, row.id, `Funnel rate / ${stage}`, String(rate), { width: 76, height: 20, fontSize: 12, fills: solid('#64748b'), textAlignHorizontal: 'RIGHT' })
  })
}

function createKpiCard(graph: SceneGraph, parentId: string, label: string, value: string, delta: string, note: string, color: string) {
  const card = createCard(graph, parentId, `KPI / ${label}`, {
    width: 312,
    height: 148,
    minWidth: 240,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FILL',
    itemSpacing: 12,
    paddingTop: 18,
    paddingRight: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    layoutGrow: 1
  })
  const top = createFrame(graph, card.id, `KPI top / ${label}`, {
    width: 260,
    height: 28,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'FILL',
    counterAxisSizing: 'HUG',
    counterAxisAlign: 'CENTER',
    itemSpacing: 8,
    fills: [],
    layoutAlignSelf: 'STRETCH'
  })
  createFrame(graph, top.id, `KPI marker / ${label}`, { width: 10, height: 10, fills: solid(color), cornerRadius: 99 })
  createText(graph, top.id, `KPI label / ${label}`, label, { width: 180, height: 18, fontSize: 12, fontWeight: 700, fills: solid('#64748b'), layoutGrow: 1 })
  createPill(graph, top.id, `KPI delta / ${label}`, delta, '#ecfdf5', '#047857', 80, 26)
  createText(graph, card.id, `KPI value / ${label}`, value, { width: 220, height: 40, fontSize: 34, fontWeight: 790, lineHeight: 40, fills: solid('#111827') })
  createText(graph, card.id, `KPI note / ${label}`, note, { width: 250, height: 20, fontSize: 12, fills: solid('#64748b') })
}

function createPanelHeader(graph: SceneGraph, parentId: string, title: string, subtitle: string) {
  const header = createFrame(graph, parentId, `Panel header / ${title}`, {
    width: 600,
    height: 48,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'FILL',
    itemSpacing: 4,
    fills: [],
    layoutAlignSelf: 'STRETCH'
  })
  createText(graph, header.id, `${title} title`, title, { width: 520, height: 24, fontSize: 18, fontWeight: 760, fills: solid('#111827') })
  createText(graph, header.id, `${title} subtitle`, subtitle, { width: 620, height: 18, fontSize: 12, fills: solid('#64748b') })
}

function createLegendItem(graph: SceneGraph, parentId: string, label: string, color: string) {
  const item = createFrame(graph, parentId, `Legend / ${label}`, {
    width: 112,
    height: 24,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG',
    counterAxisAlign: 'CENTER',
    itemSpacing: 7,
    fills: []
  })
  createFrame(graph, item.id, `Legend marker / ${label}`, { width: 10, height: 10, cornerRadius: 99, fills: solid(color) })
  createText(graph, item.id, `Legend label / ${label}`, label, { width: 80, height: 18, fontSize: 12, fills: solid('#64748b') })
}

function createPill(graph: SceneGraph, parentId: string, name: string, label: string, background: string, foreground: string, width = 116, height = 34) {
  const pill = createFrame(graph, parentId, name, {
    width,
    height,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    fills: solid(background),
    cornerRadius: Math.round(height / 2)
  })
  createText(graph, pill.id, `${name} label`, label, { width: width - 24, height: 18, fontSize: 12, fontWeight: 700, fills: solid(foreground), textAlignHorizontal: 'CENTER' })
  return pill
}

function createCard(graph: SceneGraph, parentId: string, name: string, overrides: Partial<SceneNode> = {}) {
  return createFrame(graph, parentId, name, {
    width: 320,
    height: 180,
    fills: solid('#ffffff'),
    strokes: stroke('#e2e8f0'),
    effects: shadow('#0f172a', 0.08, 0, 10, 28),
    cornerRadius: 22,
    clipsContent: false,
    ...overrides
  })
}

function createFrame(graph: SceneGraph, parentId: string, name: string, overrides: Partial<SceneNode> = {}) {
  return graph.createNode('FRAME', parentId, {
    name,
    fills: [],
    ...overrides
  })
}

function createText(graph: SceneGraph, parentId: string, name: string, text: string, overrides: Partial<SceneNode> = {}) {
  return graph.createNode('TEXT', parentId, {
    name,
    text,
    width: 120,
    height: 20,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: null,
    fills: solid('#111827'),
    ...overrides
  })
}

function solid(hex: string, opacity = 1): Fill[] {
  return [
    {
      type: 'SOLID',
      color: color(hex),
      opacity,
      visible: true
    }
  ]
}

function stroke(hex: string, weight = 1, opacity = 1): Stroke[] {
  return [
    {
      color: color(hex),
      weight,
      opacity,
      visible: true,
      align: 'INSIDE'
    }
  ]
}

function shadow(hex: string, opacity: number, x: number, y: number, radius: number): Effect[] {
  return [
    {
      type: 'DROP_SHADOW',
      color: color(hex, opacity),
      offset: { x, y },
      radius,
      spread: 0,
      visible: true,
      blendMode: 'NORMAL'
    }
  ]
}

function color(hex: string, alpha = 1): Color {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3 ? normalized.split('').map((part) => `${part}${part}`).join('') : normalized
  const number = Number.parseInt(value, 16)
  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255,
    a: alpha
  }
}
