import type { SculptSpec } from '../domain/sculpt-spec.schema.js'

export type ViewerPrimitive =
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'lathe'
  | 'extrude'
  | 'custom'

export type ViewerMaterialDto = {
  id: string
  type: 'standard' | 'physical' | 'toon' | 'lambert'
  baseColor: string
  roughness: number
  metalness: number
  opacity: number
  transparent: boolean
  vertexColors: boolean
  emissive?: string | null
  emissiveIntensity?: number
  clearcoat?: number
  clearcoatRoughness?: number
  colorRamp?: {
    axis: 'y'
    min: number
    max: number
    stops: Array<{ position: number; color: string }>
  } | null
}

export type ViewerHeightfieldGeometryDto = {
  type: 'heightfield'
  columns: number
  rows: number
  width: number
  height: number
  depth: number
  heights: number[]
  colors: string[]
}

export type ViewerRoundedBoxGeometryDto = {
  type: 'rounded-box'
  width: number
  height: number
  depth: number
  segments: number
  radius: number
}

export type ViewerTorusArcGeometryDto = {
  type: 'torus-arc'
  radius: number
  tube: number
  radialSegments: number
  tubularSegments: number
  arc: number
}

export type ViewerExtrudeShapeGeometryDto = {
  type: 'extrude-shape'
  points: Array<[number, number]>
  depth: number
  bevelEnabled: boolean
  bevelThickness: number
  bevelSize: number
  bevelSegments: number
  curveSegments: number
}

export type ViewerGeometryDto =
  | ViewerHeightfieldGeometryDto
  | ViewerRoundedBoxGeometryDto
  | ViewerTorusArcGeometryDto
  | ViewerExtrudeShapeGeometryDto

export type ViewerComponentDto = {
  id: string
  parentId: string | null
  name: string
  primitive: ViewerPrimitive
  geometry: ViewerGeometryDto | null
  materialId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type ViewerPivotDto = {
  id: string
  componentId: string
  kind: 'rotation' | 'translation' | 'root_motion'
  origin: [number, number, number]
  axis: [number, number, number]
  min: number
  max: number
}

export type ViewerSceneDto = {
  schemaVersion: '1.0.0'
  projectName: string
  route: 'object' | 'character'
  components: ViewerComponentDto[]
  materials: ViewerMaterialDto[]
  pivots?: ViewerPivotDto[]
  animationClips?: Array<{
    name: string
    durationSeconds: number
    pivotIds: string[]
  }>
}

export function toViewerScene(spec: SculptSpec): ViewerSceneDto {
  return {
    schemaVersion: spec.schemaVersion,
    projectName: spec.projectName,
    route: spec.route,
    components: spec.components.map((component) => ({
      id: component.id,
      parentId: component.parentId,
      name: component.name,
      primitive: component.primitive,
      geometry: component.geometry ?? null,
      materialId: component.materialId,
      position: component.transform.position,
      rotation: component.transform.rotation,
      scale: component.transform.scale
    })),
    materials: spec.materials.map((material) => ({
      id: material.id,
      type: material.type,
      baseColor: material.baseColor,
      roughness: material.roughness,
      metalness: material.metalness,
      opacity: material.opacity,
      transparent: material.transparent,
      vertexColors: material.vertexColors ?? false,
      emissive: material.emissive ?? null,
      emissiveIntensity: material.emissiveIntensity ?? 1,
      clearcoat: material.clearcoat ?? 0,
      clearcoatRoughness: material.clearcoatRoughness ?? 0,
      colorRamp: material.colorRamp ?? null
    })),
    pivots: spec.runtime.pivots.map((pivot) => ({
      id: pivot.id,
      componentId: pivot.componentId,
      kind: pivot.kind,
      origin: pivot.origin,
      axis: pivot.axis,
      min: pivot.min,
      max: pivot.max
    })),
    animationClips: spec.runtime.animationClips.map((clip) => ({
      name: clip.name,
      durationSeconds: clip.durationSeconds,
      pivotIds: clip.pivotIds
    }))
  }
}
