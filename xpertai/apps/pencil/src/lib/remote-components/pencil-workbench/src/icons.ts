import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import type { Tool } from '@open\u002dpencil/vue'

export type PencilIconName =
  | 'archive'
  | 'assets'
  | 'check'
  | 'book'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'code'
  | 'columns'
  | 'copy'
  | 'cursor'
  | 'download'
  | 'eye'
  | 'file'
  | 'frame'
  | 'grid'
  | 'hand'
  | 'history'
  | 'horizontal'
  | 'layers'
  | 'line'
  | 'lock'
  | 'minus'
  | 'pen'
  | 'plus'
  | 'rectangle'
  | 'refresh'
  | 'save'
  | 'sparkles'
  | 'text'
  | 'trash'
  | 'upload'
  | 'vertical'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignTop'
  | 'alignMiddle'
  | 'alignBottom'
  | 'alignStretch'
  | 'wrap'

type SvgChild = VNodeChild

const svgAttrs = {
  width: '16',
  height: '16',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true'
}

function path(d: string) {
  return h('path', { d })
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return h('line', { x1, y1, x2, y2 })
}

function rect(x: number, y: number, width: number, height: number, rx = 2) {
  return h('rect', { x, y, width, height, rx })
}

function circle(cx: number, cy: number, r: number) {
  return h('circle', { cx, cy, r })
}

function polyline(points: string) {
  return h('polyline', { points })
}

function polygon(points: string) {
  return h('polygon', { points })
}

function iconPaths(name: PencilIconName | string): SvgChild[] {
  switch (name) {
    case 'archive':
      return [rect(3, 4, 18, 4, 1), path('M5 8v11h14V8'), path('M10 12h4')]
    case 'assets':
      return [rect(4, 4, 7, 7), rect(13, 4, 7, 7), rect(4, 13, 7, 7), rect(13, 13, 7, 7)]
    case 'book':
      return [path('M4 19.5A2.5 2.5 0 0 1 6.5 17H20'), path('M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z')]
    case 'check':
      return [path('M20 6 9 17l-5-5')]
    case 'chevronDown':
      return [polyline('6 9 12 15 18 9')]
    case 'chevronLeft':
      return [polyline('15 6 9 12 15 18')]
    case 'chevronRight':
      return [polyline('9 6 15 12 9 18')]
    case 'code':
      return [path('m16 18 6-6-6-6'), path('m8 6-6 6 6 6')]
    case 'columns':
      return [rect(4, 5, 16, 14), line(12, 5, 12, 19)]
    case 'copy':
      return [rect(8, 8, 12, 12, 2), path('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2')]
    case 'cursor':
      return [polygon('4 3 19 12 13 14 10 21')]
    case 'download':
      return [path('M12 3v12'), polyline('7 10 12 15 17 10'), path('M5 21h14')]
    case 'eye':
      return [path('M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z'), circle(12, 12, 3)]
    case 'file':
      return [path('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z'), path('M14 3v6h6')]
    case 'frame':
      return [rect(4, 4, 16, 16, 1), line(4, 9, 20, 9), line(9, 4, 9, 20)]
    case 'grid':
      return [rect(4, 4, 6, 6, 1), rect(14, 4, 6, 6, 1), rect(4, 14, 6, 6, 1), rect(14, 14, 6, 6, 1)]
    case 'hand':
      return [path('M18 11V7a2 2 0 0 0-4 0v4'), path('M14 10V6a2 2 0 0 0-4 0v6'), path('M10 11V8a2 2 0 0 0-4 0v6'), path('M6 14 5 12a2 2 0 0 0-3 2l3 6h11a4 4 0 0 0 4-4v-5a2 2 0 0 0-4 0')]
    case 'history':
      return [path('M3 12a9 9 0 1 0 3-6.7'), path('M3 4v5h5'), path('M12 7v6l4 2')]
    case 'horizontal':
      return [line(4, 12, 20, 12), polyline('8 8 4 12 8 16'), polyline('16 8 20 12 16 16')]
    case 'layers':
      return [polygon('12 3 21 8 12 13 3 8 12 3'), path('m3 13 9 5 9-5'), path('m3 18 9 5 9-5')]
    case 'line':
      return [line(5, 19, 19, 5)]
    case 'lock':
      return [rect(5, 11, 14, 10, 2), path('M8 11V8a4 4 0 0 1 8 0v3')]
    case 'minus':
      return [line(5, 12, 19, 12)]
    case 'pen':
      return [path('m12 19 7-7 3 3-7 7-4 1 1-4Z'), path('m18 13-7-7')]
    case 'plus':
      return [line(12, 5, 12, 19), line(5, 12, 19, 12)]
    case 'rectangle':
      return [rect(4, 6, 16, 12)]
    case 'refresh':
      return [path('M20 6v5h-5'), path('M4 18v-5h5'), path('M18 9a6 6 0 0 0-10-3L4 10'), path('M6 15a6 6 0 0 0 10 3l4-4')]
    case 'save':
      return [path('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z'), path('M17 21v-8H7v8'), path('M7 3v5h8')]
    case 'sparkles':
      return [path('M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2Z'), path('M19 3v4'), path('M21 5h-4')]
    case 'text':
      return [path('M4 7V4h16v3'), path('M9 20h6'), line(12, 4, 12, 20)]
    case 'trash':
      return [path('M3 6h18'), path('M8 6V4h8v2'), path('M19 6l-1 14H6L5 6'), line(10, 10, 10, 16), line(14, 10, 14, 16)]
    case 'upload':
      return [path('M12 21V9'), polyline('7 14 12 9 17 14'), path('M5 3h14')]
    case 'vertical':
      return [line(12, 4, 12, 20), polyline('8 8 12 4 16 8'), polyline('8 16 12 20 16 16')]
    case 'alignLeft':
      return [line(4, 4, 4, 20), rect(8, 6, 10, 4, 1), rect(8, 14, 7, 4, 1)]
    case 'alignCenter':
      return [line(12, 4, 12, 20), rect(7, 6, 10, 4, 1), rect(9, 14, 6, 4, 1)]
    case 'alignRight':
      return [line(20, 4, 20, 20), rect(6, 6, 10, 4, 1), rect(9, 14, 7, 4, 1)]
    case 'alignTop':
      return [line(4, 4, 20, 4), rect(6, 8, 4, 10, 1), rect(14, 8, 4, 7, 1)]
    case 'alignMiddle':
      return [line(4, 12, 20, 12), rect(6, 7, 4, 10, 1), rect(14, 9, 4, 6, 1)]
    case 'alignBottom':
      return [line(4, 20, 20, 20), rect(6, 6, 4, 10, 1), rect(14, 9, 4, 7, 1)]
    case 'alignStretch':
      return [rect(6, 5, 12, 14, 1), line(6, 9, 18, 9), line(6, 15, 18, 15)]
    case 'wrap':
      return [path('M4 7h12a4 4 0 0 1 0 8H8'), polyline('11 12 8 15 11 18')]
    default:
      return [circle(12, 12, 8)]
  }
}

export function renderIcon(name: PencilIconName | string, className = 'pencil-icon') {
  return h('svg', { ...svgAttrs, class: className }, iconPaths(name))
}

/** Bridges the compact dynamic icon map into SFC templates without duplicating SVG markup. */
export const PencilIcon = defineComponent({
  name: 'PencilIcon',
  props: {
    name: { type: String as PropType<PencilIconName>, required: true },
    className: { type: String, default: 'pencil-icon' }
  },
  setup(props) {
    return () => renderIcon(props.name, props.className)
  }
})

export function toolIcon(tool: Tool | string): PencilIconName {
  const icons: Record<string, PencilIconName> = {
    SELECT: 'cursor',
    FRAME: 'frame',
    SECTION: 'columns',
    RECTANGLE: 'rectangle',
    ELLIPSE: 'rectangle',
    LINE: 'line',
    POLYGON: 'pen',
    STAR: 'sparkles',
    TEXT: 'text',
    PEN: 'pen',
    HAND: 'hand'
  }
  return icons[String(tool)] ?? 'cursor'
}

export function layerIcon(type: string): PencilIconName {
  const normalized = type.toUpperCase()
  if (normalized === 'CANVAS') return 'file'
  if (normalized === 'FRAME' || normalized === 'SECTION' || normalized === 'GROUP') return 'frame'
  if (normalized === 'TEXT') return 'text'
  if (normalized.includes('VECTOR') || normalized === 'LINE') return 'pen'
  if (normalized === 'COMPONENT' || normalized === 'INSTANCE') return 'assets'
  if (normalized === 'RECTANGLE' || normalized === 'ELLIPSE' || normalized === 'POLYGON' || normalized === 'STAR') return 'rectangle'
  return 'layers'
}
