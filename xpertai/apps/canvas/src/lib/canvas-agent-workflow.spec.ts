jest.mock('fractional-indexing', () => {
  let sequence = 0
  return { generateKeyBetween: jest.fn(() => `a${sequence++}`) }
})

import { compileWorkflowShapes, prepareCanvasWorkflow } from './canvas-agent-workflow.js'
import type { CanvasRecord, CreateCanvasWorkflowInput } from './types.js'

const workflow: CreateCanvasWorkflowInput = {
  mode: 'replace_page',
  title: 'XpertAI 多智能体协作工作流',
  subtitle: '从业务需求到真实交付',
  stages: [
    { key: 'brief', label: '业务需求', detail: '明确目标与边界' },
    { key: 'plan', label: 'Agent 规划', detail: '拆解任务与资源' },
    { key: 'execute', label: '并行执行', detail: '多智能体协同', emphasis: true },
    { key: 'review', label: '人工审阅', detail: '关键节点把关' },
    { key: 'deliver', label: '真实交付', detail: '沉淀可用成果' }
  ],
  branches: [
    { key: 'research', label: 'Research Agent', detail: '检索与分析', parentStageKey: 'execute' },
    { key: 'creation', label: 'Creation Agent', detail: '内容生产', parentStageKey: 'execute' },
    { key: 'reviewer', label: 'Review Agent', detail: '质量校验', parentStageKey: 'execute' }
  ]
}

describe('Canvas semantic workflow layout', () => {
  it('compiles a balanced native tldraw board with embedded card labels', () => {
    const shapes = compileWorkflowShapes(workflow, 'page:page')
    const geos = shapes.filter((shape) => shape.type === 'geo')
    const texts = shapes.filter((shape) => shape.type === 'text')
    const arrows = shapes.filter((shape) => shape.type === 'arrow')

    expect(shapes).toHaveLength(21)
    expect(geos).toHaveLength(11)
    expect(texts).toHaveLength(3)
    expect(arrows).toHaveLength(7)
    expect(geos[0]).toEqual(expect.objectContaining({ color: 'black', fill: 'fill', isLocked: true }))
    expect(geos.filter((shape) => shape.text?.includes('业务需求'))).toHaveLength(1)
    expect(geos.filter((shape) => shape.text?.includes('Research Agent'))).toHaveLength(1)
    expect(geos.find((shape) => shape.text?.includes('并行执行'))).toEqual(expect.objectContaining({ fill: 'fill', labelColor: 'white' }))
    expect(texts.some((shape) => shape.text.startsWith('01  业务需求'))).toBe(false)
    for (const card of geos.filter((shape) => shape.text?.match(/^(0\d|Research|Creation|Review)/))) {
      expect(card.x + (card.width ?? 0)).toBeLessThanOrEqual(1_280)
    }

    for (const shape of shapes) {
      if (shape.type === 'arrow') {
        expect(Math.min(shape.start.x, shape.end.x)).toBeGreaterThanOrEqual(0)
        expect(Math.max(shape.start.x, shape.end.x)).toBeLessThanOrEqual(1_600)
        expect(Math.min(shape.start.y, shape.end.y)).toBeGreaterThanOrEqual(0)
        expect(Math.max(shape.start.y, shape.end.y)).toBeLessThanOrEqual(860)
      } else {
        expect(shape.x).toBeGreaterThanOrEqual(0)
        expect(shape.y).toBeGreaterThanOrEqual(0)
        if ('width' in shape && shape.width) expect(shape.x + shape.width).toBeLessThanOrEqual(1_600)
      }
    }
  })

  it('atomically removes stale page content before creating a replacement workflow', () => {
    const store: Record<string, CanvasRecord> = {
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a0', meta: {} },
      'shape:old-arrow': oldShape('shape:old-arrow', 'arrow', 'page:page'),
      'shape:old-card': oldShape('shape:old-card', 'geo', 'page:page'),
      'binding:old': {
        id: 'binding:old', typeName: 'binding', type: 'arrow', fromId: 'shape:old-arrow', toId: 'shape:old-card',
        props: {}, meta: {}
      }
    }

    const result = prepareCanvasWorkflow(store, workflow)

    expect(result.removedRecordIds).toEqual(expect.arrayContaining(['shape:old-arrow', 'shape:old-card', 'binding:old']))
    expect(store['page:page']).toBeTruthy()
    expect(store['shape:old-arrow']).toBeUndefined()
    expect(result.createdRecordIds).toHaveLength(21)
    expect(Object.values(store).filter((record) => record.typeName === 'shape' && record.type === 'arrow')).toHaveLength(7)
  })

  it('appends a new board below existing page content without deleting it', () => {
    const store: Record<string, CanvasRecord> = {
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a0', meta: {} },
      'shape:existing': {
        ...oldShape('shape:existing', 'geo', 'page:page'),
        y: 400,
        props: { w: 200, h: 200 }
      }
    }

    const result = prepareCanvasWorkflow(store, { ...workflow, mode: 'append' })
    const createdY = result.createdRecordIds.map((id) => store[id]?.y).filter((value): value is number => typeof value === 'number')

    expect(result.removedRecordIds).toEqual([])
    expect(store['shape:existing']).toBeTruthy()
    expect(Math.min(...createdY)).toBe(760)
  })
})

function oldShape(id: string, type: string, parentId: string): CanvasRecord {
  return {
    id,
    typeName: 'shape',
    type,
    parentId,
    index: `a-${id}`,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    isLocked: false,
    props: type === 'arrow' ? { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } } : { w: 100, h: 100 },
    meta: {}
  }
}
