import * as React from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {
  ViewerComponentDto,
  ViewerHeightfieldGeometryDto,
  ViewerMaterialDto,
  ViewerPivotDto,
  ViewerSceneDto
} from '../../../contracts/viewer-scene.js'

type ViewerLabels = {
  ariaLabel: string
  autoRotate: string
  dragHint: string
  loading: string
  playAnimation: string
  ready: string
  resetView: string
  unavailable: string
}

export function ThreeViewer(props: {
  scene: ViewerSceneDto
  labels: ViewerLabels
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const controlsRef = React.useRef<OrbitControls | null>(null)
  const resetRef = React.useRef<(() => void) | null>(null)
  const animationEnabledRef = React.useRef(true)
  const [autoRotate, setAutoRotate] = React.useState(true)
  const [animationEnabled, setAnimationEnabled] = React.useState(true)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'unavailable'>('loading')

  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement
    if (!canvas || !container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      })
    } catch {
      setStatus('unavailable')
      return
    }

    const world = new THREE.Scene()
    world.background = new THREE.Color('#0b1020')

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 2_000)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.15
    controlsRef.current = controls

    world.add(new THREE.HemisphereLight('#dbeafe', '#172554', 2.2))
    const keyLight = new THREE.DirectionalLight('#ffffff', 3.2)
    keyLight.position.set(6, 9, 8)
    keyLight.castShadow = true
    world.add(keyLight)
    const rimLight = new THREE.DirectionalLight('#a78bfa', 2.4)
    rimLight.position.set(-8, 4, -6)
    world.add(rimLight)

    const root = buildModel(props.scene)
    world.add(root)
    const initialBox = new THREE.Box3().setFromObject(root)
    const initialSphere = initialBox.getBoundingSphere(new THREE.Sphere())
    const initialRadius = Number.isFinite(initialSphere.radius) && initialSphere.radius > 0
      ? initialSphere.radius
      : 1
    const gridSize = Math.max(24, initialRadius * 4)
    const grid = new THREE.GridHelper(gridSize, 24, '#334155', '#1e293b')
    grid.position.y = modelFloor(root)
    world.add(grid)

    const resize = () => {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()

    const resetView = () => {
      const box = new THREE.Box3().setFromObject(root)
      const center = box.getCenter(new THREE.Vector3())
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1
      const narrowViewportFit = 1 / Math.max(0.25, Math.min(1, camera.aspect))
      const distance = Math.max(1.8, radius * 2.8 * narrowViewportFit)
      const viewDirection = new THREE.Vector3(1, 0.58, 1.15).normalize()
      camera.position.copy(center).addScaledVector(viewDirection, distance)
      camera.near = Math.max(0.01, distance / 1_000)
      camera.far = Math.max(100, distance * 20)
      camera.updateProjectionMatrix()
      controls.target.copy(center)
      controls.minDistance = Math.max(0.15, radius * 0.35)
      controls.maxDistance = Math.max(20, radius * 12)
      controls.update()
    }
    resetRef.current = resetView
    resetView()

    const resizeObserver = new ResizeObserver(() => {
      resize()
      resetView()
    })
    resizeObserver.observe(container)

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const timer = new THREE.Timer()
    renderer.setAnimationLoop(() => {
      timer.update()
      controls.update()
      const clip = props.scene.animationClips?.[0]
      if (animationEnabledRef.current && clip) {
        const phase = (timer.getElapsed() / clip.durationSeconds) * Math.PI
        applyViewerAnimation(root, clip.pivotIds, (1 - Math.cos(phase)) / 2)
      }
      renderer.render(world, camera)
    })
    setStatus('ready')

    return () => {
      renderer.setAnimationLoop(null)
      resizeObserver.disconnect()
      controls.dispose()
      controlsRef.current = null
      resetRef.current = null
      disposeModel(root)
      renderer.dispose()
    }
  }, [props.scene])

  React.useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate
  }, [autoRotate])

  React.useEffect(() => {
    animationEnabledRef.current = animationEnabled
  }, [animationEnabled])

  return (
    <div className="viewer-shell">
      <div className="viewer-toolbar">
        <span
          className={`viewer-status ${status}`}
          data-testid="threejs-viewer-status"
          role="status"
        >
          {props.labels[status]}
        </span>
        <div className="viewer-actions">
          <button
            type="button"
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((value) => !value)}
          >
            {props.labels.autoRotate}
          </button>
          {(props.scene.animationClips?.length ?? 0) > 0
            ? <button
                type="button"
                aria-pressed={animationEnabled}
                onClick={() => setAnimationEnabled((value) => !value)}
              >
                {props.labels.playAnimation}
              </button>
            : null}
          <button type="button" onClick={() => resetRef.current?.()}>
            {props.labels.resetView}
          </button>
        </div>
      </div>
      <div className="viewer-viewport">
        <canvas
          ref={canvasRef}
          data-testid="threejs-viewer"
          role="application"
          aria-label={props.labels.ariaLabel}
        />
        <p className="viewer-hint">{props.labels.dragHint}</p>
      </div>
    </div>
  )
}

function buildModel(scene: ViewerSceneDto): THREE.Group {
  const root = new THREE.Group()
  root.name = scene.projectName
  const materials = new Map(scene.materials.map((material) => [
    material.id,
    createMaterial(material)
  ]))
  const fallbackMaterial = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.72,
    metalness: 0.08
  })
  const components = new Map<string, THREE.Group>()

  for (const component of scene.components) {
    const group = new THREE.Group()
    group.name = component.name
    group.userData.componentId = component.id
    group.position.fromArray(component.position)
    group.rotation.fromArray(component.rotation)
    const mesh = new THREE.Mesh(
      createGeometry(component),
      materials.get(component.materialId) ?? fallbackMaterial
    )
    mesh.name = `${component.name}:geometry`
    mesh.userData.componentId = component.id
    mesh.scale.fromArray(component.scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    components.set(component.id, group)
  }

  for (const component of scene.components) {
    const group = components.get(component.id)
    if (!group) continue
    const parent = component.parentId ? components.get(component.parentId) : null
    ;(parent ?? root).add(group)
  }

  const pivotControllers = new Map<string, ViewerPivotController>()
  for (const pivot of scene.pivots ?? []) {
    const component = components.get(pivot.componentId)
    const parent = component?.parent
    if (!component || !parent) continue
    const group = new THREE.Group()
    group.name = `pivot:${pivot.id}`
    group.position.fromArray(pivot.origin)
    parent.add(group)
    component.position.sub(group.position)
    group.add(component)
    pivotControllers.set(pivot.id, {
      group,
      pivot,
      basePosition: group.position.clone(),
      baseQuaternion: group.quaternion.clone()
    })
  }

  root.userData.viewerSceneVersion = scene.schemaVersion
  root.userData.route = scene.route
  root.userData.pivotControllers = pivotControllers
  return root
}

function createGeometry(component: ViewerComponentDto): THREE.BufferGeometry {
  if (component.geometry) {
    switch (component.geometry.type) {
      case 'heightfield':
        return createHeightfieldGeometry(component.geometry)
      case 'rounded-box':
        return new RoundedBoxGeometry(
          component.geometry.width,
          component.geometry.height,
          component.geometry.depth,
          component.geometry.segments,
          component.geometry.radius
        )
      case 'torus-arc':
        return new THREE.TorusGeometry(
          component.geometry.radius,
          component.geometry.tube,
          component.geometry.radialSegments,
          component.geometry.tubularSegments,
          component.geometry.arc
        )
      case 'extrude-shape': {
        const [first, ...rest] = component.geometry.points
        const shape = new THREE.Shape()
        shape.moveTo(first[0], first[1])
        for (const point of rest) shape.lineTo(point[0], point[1])
        shape.closePath()
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: component.geometry.depth,
          bevelEnabled: component.geometry.bevelEnabled,
          bevelThickness: component.geometry.bevelThickness,
          bevelSize: component.geometry.bevelSize,
          bevelSegments: component.geometry.bevelSegments,
          curveSegments: component.geometry.curveSegments
        })
        geometry.center()
        return geometry
      }
    }
  }
  switch (component.primitive) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 20)
    case 'capsule':
      return new THREE.CapsuleGeometry(0.35, 0.7, 8, 16)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 24)
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.16, 12, 32)
    case 'lathe':
      return new THREE.SphereGeometry(0.5, 24, 16)
    case 'extrude':
      return new THREE.BoxGeometry(1, 1, 0.2)
    case 'box':
    case 'custom':
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

function createHeightfieldGeometry(
  geometry: ViewerHeightfieldGeometryDto
): THREE.BufferGeometry {
  const { columns, rows, width, height, depth, heights, colors } = geometry
  const positions: number[] = []
  const vertexColors: number[] = []
  const indices: number[] = []
  const frontCount = columns * rows

  for (let layer = 0; layer < 2; layer += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const sample = row * columns + column
        const x = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * width
        const y = rows === 1 ? 0 : (0.5 - row / (rows - 1)) * height
        const z = layer === 0 ? -depth / 2 + heights[sample] * depth : -depth / 2
        positions.push(x, y, z)
        const color = new THREE.Color(colors[sample] ?? '#808080')
        vertexColors.push(color.r, color.g, color.b)
      }
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices.push(a, c, b, b, c, d)
      indices.push(frontCount + a, frontCount + b, frontCount + c)
      indices.push(frontCount + b, frontCount + d, frontCount + c)
    }
  }

  const perimeter: number[] = []
  for (let column = 0; column < columns; column += 1) perimeter.push(column)
  for (let row = 1; row < rows; row += 1) perimeter.push(row * columns + columns - 1)
  for (let column = columns - 2; column >= 0; column -= 1) perimeter.push((rows - 1) * columns + column)
  for (let row = rows - 2; row > 0; row -= 1) perimeter.push(row * columns)
  for (let index = 0; index < perimeter.length; index += 1) {
    const a = perimeter[index]
    const b = perimeter[(index + 1) % perimeter.length]
    indices.push(a, b, frontCount + a, b, frontCount + b, frontCount + a)
  }

  const buffer = new THREE.BufferGeometry()
  buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  buffer.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3))
  buffer.setIndex(indices)
  buffer.computeVertexNormals()
  buffer.computeBoundingBox()
  buffer.computeBoundingSphere()
  return buffer
}

function createMaterial(material: ViewerMaterialDto): THREE.Material {
  const common = {
    color: material.baseColor,
    emissive: material.emissive ?? '#000000',
    emissiveIntensity: material.emissiveIntensity ?? 1,
    opacity: material.opacity,
    transparent: material.transparent,
    vertexColors: material.vertexColors,
    side: THREE.DoubleSide
  }
  if (material.type === 'physical') {
    const physical = new THREE.MeshPhysicalMaterial({
      ...common,
      roughness: material.roughness,
      metalness: material.metalness,
      clearcoat: material.clearcoat ?? 0,
      clearcoatRoughness: material.clearcoatRoughness ?? 0
    })
    configureHeightColorRamp(physical, material)
    return physical
  }
  const result = material.type === 'toon'
    ? new THREE.MeshToonMaterial(common)
    : material.type === 'lambert'
      ? new THREE.MeshLambertMaterial(common)
      : new THREE.MeshStandardMaterial({
    ...common,
    roughness: material.roughness,
    metalness: material.metalness
  })
  configureHeightColorRamp(result, material)
  return result
}

function configureHeightColorRamp(material: THREE.Material, definition: ViewerMaterialDto): void {
  const ramp = definition.colorRamp
  if (!ramp) return
  const stops = ramp.stops.map((stop) => {
    const color = new THREE.Color(stop.color).convertSRGBToLinear()
    return { position: stop.position, color }
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.img2threejsRampMin = { value: ramp.min }
    shader.uniforms.img2threejsRampMax = { value: ramp.max }
    shader.vertexShader = `varying float img2threejsRampY;\n${shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nimg2threejsRampY = (modelMatrix * vec4(transformed, 1.0)).y;'
    )}`
    const mixes = stops.slice(1).map((stop, index) => {
      const previous = stops[index]
      return `img2threejsRampColor = mix(img2threejsRampColor, vec3(${glslFloat(stop.color.r)}, ${glslFloat(stop.color.g)}, ${glslFloat(stop.color.b)}), smoothstep(${glslFloat(previous.position)}, ${glslFloat(stop.position)}, img2threejsRampT));`
    }).join('\n')
    shader.fragmentShader = `varying float img2threejsRampY;
uniform float img2threejsRampMin;
uniform float img2threejsRampMax;
${shader.fragmentShader.replace(
  '#include <color_fragment>',
  `#include <color_fragment>
float img2threejsRampT = clamp((img2threejsRampY - img2threejsRampMin) / (img2threejsRampMax - img2threejsRampMin), 0.0, 1.0);
vec3 img2threejsRampColor = vec3(${glslFloat(stops[0].color.r)}, ${glslFloat(stops[0].color.g)}, ${glslFloat(stops[0].color.b)});
${mixes}
diffuseColor.rgb *= img2threejsRampColor;`
)}`
  }
  material.customProgramCacheKey = () => `img2threejs-color-ramp:${JSON.stringify(ramp)}`
}

function glslFloat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value)
}

type ViewerPivotController = {
  group: THREE.Group
  pivot: ViewerPivotDto
  basePosition: THREE.Vector3
  baseQuaternion: THREE.Quaternion
}

function applyViewerAnimation(root: THREE.Group, pivotIds: string[], progress: number): void {
  const controllers = root.userData.pivotControllers as Map<string, ViewerPivotController> | undefined
  if (!controllers) return
  for (const pivotId of pivotIds) {
    const controller = controllers.get(pivotId)
    if (!controller) continue
    const { group, pivot, basePosition, baseQuaternion } = controller
    const baseline = THREE.MathUtils.clamp(0, pivot.min, pivot.max)
    const endpoint = Math.abs(pivot.max - baseline) >= Math.abs(pivot.min - baseline)
      ? pivot.max
      : pivot.min
    const value = THREE.MathUtils.lerp(baseline, endpoint, progress)
    const axis = new THREE.Vector3().fromArray(pivot.axis).normalize()
    if (pivot.kind === 'rotation') {
      group.position.copy(basePosition)
      group.quaternion.copy(baseQuaternion).multiply(
        new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(value))
      )
    } else {
      group.quaternion.copy(baseQuaternion)
      group.position.copy(basePosition).addScaledVector(axis, value)
    }
  }
}

function modelFloor(root: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(root)
  return Number.isFinite(box.min.y) ? box.min.y : -0.5
}

function disposeModel(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of meshMaterials) materials.add(material)
  })
  for (const material of materials) material.dispose()
}
