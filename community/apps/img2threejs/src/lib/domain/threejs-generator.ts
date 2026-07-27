import type { SculptSpec } from './sculpt-spec.schema.js'

const PRIMITIVE_FACTORIES: Record<SculptSpec['components'][number]['primitive'], string> = {
  box: 'new THREE.BoxGeometry(1, 1, 1)',
  sphere: 'new THREE.SphereGeometry(0.5, 32, 20)',
  capsule: 'new THREE.CapsuleGeometry(0.35, 0.7, 8, 16)',
  cylinder: 'new THREE.CylinderGeometry(0.5, 0.5, 1, 24)',
  cone: 'new THREE.ConeGeometry(0.5, 1, 24)',
  torus: 'new THREE.TorusGeometry(0.5, 0.16, 12, 32)',
  lathe: 'new THREE.SphereGeometry(0.5, 24, 16)',
  extrude: 'new THREE.BoxGeometry(1, 1, 0.2)',
  custom: 'new THREE.BoxGeometry(1, 1, 1)'
}

export function generateThreeJsFactory(spec: SculptSpec): string {
  const factoryName = toPascalCase(spec.projectName)
  const materials = spec.materials
    .map((material) => {
      const variable = safeMaterialVariable(material.id)
      const ctor = material.type === 'physical'
        ? 'MeshPhysicalMaterial'
        : material.type === 'toon'
          ? 'MeshToonMaterial'
          : material.type === 'lambert'
          ? 'MeshLambertMaterial'
            : 'MeshStandardMaterial'
      const physicalProperties = material.type === 'physical'
        ? `
    clearcoat: ${material.clearcoat ?? 0},
    clearcoatRoughness: ${material.clearcoatRoughness ?? 0},`
        : ''
      const pbrProperties = material.type === 'standard' || material.type === 'physical'
        ? `
    color: ${JSON.stringify(material.baseColor)},
    roughness: ${material.roughness},
    metalness: ${material.metalness},
    emissive: ${JSON.stringify(material.emissive ?? '#000000')},
    emissiveIntensity: ${material.emissiveIntensity ?? 1},${physicalProperties}
    opacity: ${material.opacity},
    transparent: ${material.transparent},
    vertexColors: ${material.vertexColors ?? false}
  });`
        : `
    color: ${JSON.stringify(material.baseColor)},
    emissive: ${JSON.stringify(material.emissive ?? '#000000')},
    emissiveIntensity: ${material.emissiveIntensity ?? 1},
    opacity: ${material.opacity},
    transparent: ${material.transparent},
    vertexColors: ${material.vertexColors ?? false}
  });`
      return `  const ${variable} = new THREE.${ctor}({${pbrProperties}
  ${material.colorRamp ? `configureHeightColorRamp(${variable}, ${JSON.stringify(material.colorRamp)});` : ''}
  materials.set(${JSON.stringify(material.id)}, ${variable});`
    })
    .join('\n')

  const componentDeclarations = spec.components
    .map((component) => {
      const variable = safeVariable(component.id)
      const meshVariable = `${variable}_mesh`
      const [px, py, pz] = component.transform.position
      const [rx, ry, rz] = component.transform.rotation
      const [sx, sy, sz] = component.transform.scale
      const geometry = geometryFactory(component)
      return `  const ${variable} = new THREE.Group();
  ${variable}.name = ${JSON.stringify(component.name)};
  ${variable}.userData.componentId = ${JSON.stringify(component.id)};
  ${variable}.position.set(${px}, ${py}, ${pz});
  ${variable}.rotation.set(${rx}, ${ry}, ${rz});
  const ${meshVariable} = new THREE.Mesh(
    ${geometry},
    materials.get(${JSON.stringify(component.materialId)})
  );
  ${meshVariable}.name = ${JSON.stringify(`${component.name}:geometry`)};
  ${meshVariable}.userData.componentId = ${JSON.stringify(component.id)};
  ${meshVariable}.scale.set(${sx}, ${sy}, ${sz});
  ${variable}.add(${meshVariable});
  nodes.set(${JSON.stringify(component.id)}, ${variable});`
    })
    .join('\n\n')

  const componentAttachments = spec.components
    .map((component) => `  ${component.parentId ? safeVariable(component.parentId) : 'root'}.add(${safeVariable(component.id)});`)
    .join('\n')

  const pivots = spec.runtime.pivots
    .map((pivot) => `  registerPivot(
    ${JSON.stringify(pivot.id)},
    ${safeVariable(pivot.componentId)},
    ${JSON.stringify(pivot)}
  );`)
    .join('\n')

  const sockets = spec.runtime.sockets
    .map((socket) => {
      const [px, py, pz] = socket.transform.position
      const [rx, ry, rz] = socket.transform.rotation
      const [sx, sy, sz] = socket.transform.scale
      return `  {
    const socket = new THREE.Group();
    socket.name = ${JSON.stringify(socket.name)};
    socket.position.set(${px}, ${py}, ${pz});
    socket.rotation.set(${rx}, ${ry}, ${rz});
    socket.scale.set(${sx}, ${sy}, ${sz});
    ${safeVariable(socket.componentId)}.add(socket);
    runtimeSockets.set(${JSON.stringify(socket.id)}, socket);
  }`
    })
    .join('\n')

  const animations = spec.runtime.animationClips
    .map((clip) => `  animations.set(${JSON.stringify(clip.name)}, (progress: number) => {
    const normalized = THREE.MathUtils.clamp(progress, 0, 1);
    for (const pivotId of ${JSON.stringify(clip.pivotIds)}) applyPivot(pivotId, normalized);
  });`)
    .join('\n')

  const runtimeMetadata = JSON.stringify({
    schemaVersion: spec.schemaVersion,
    route: spec.route,
    pivots: spec.runtime.pivots,
    sockets: spec.runtime.sockets,
    colliders: spec.runtime.colliders,
    animationClips: spec.runtime.animationClips,
    qualityContract: spec.qualityContract
  }, null, 2)
  const heightfieldHelper = spec.components.some((component) => component.geometry?.type === 'heightfield')
    ? HEIGHTFIELD_HELPER
    : ''
  const colorRampHelper = spec.materials.some((material) => material.colorRamp)
    ? COLOR_RAMP_HELPER
    : ''
  const roundedBoxImport = spec.components.some((component) => component.geometry?.type === 'rounded-box')
    ? `import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';\n`
    : ''

  return `import * as THREE from 'three';
${roundedBoxImport}

${heightfieldHelper}
${colorRampHelper}
type PivotDefinition = {
  kind: 'rotation' | 'translation' | 'root_motion';
  origin: [number, number, number];
  axis: [number, number, number];
  min: number;
  max: number;
};

type PivotController = {
  group: THREE.Group;
  definition: PivotDefinition;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
};

export type ${factoryName}Model = {
  root: THREE.Group;
  materials: ReadonlyMap<string, THREE.Material>;
  nodes: ReadonlyMap<string, THREE.Object3D>;
  sockets: ReadonlyMap<string, THREE.Object3D>;
  animations: ReadonlyMap<string, (progress: number) => void>;
  applyPivot(pivotId: string, progress: number): void;
  dispose(): void;
};

/**
 * Deterministic procedural factory generated from Sculpt Spec ${spec.schemaVersion}.
 * Runtime units: ${spec.coordinateSystem.units}; up: ${spec.coordinateSystem.up}; forward: ${spec.coordinateSystem.forward}.
 */
export function create${factoryName}Model(): ${factoryName}Model {
  const root = new THREE.Group();
  root.name = ${JSON.stringify(spec.projectName)};
  const materials = new Map<string, THREE.Material>();
  const nodes = new Map<string, THREE.Object3D>();
  const runtimeSockets = new Map<string, THREE.Object3D>();
  const pivotControllers = new Map<string, PivotController>();
  const animations = new Map<string, (progress: number) => void>();

${materials}

${componentDeclarations}

${componentAttachments}

  const registerPivot = (id: string, component: THREE.Object3D, definition: PivotDefinition) => {
    const parent = component.parent;
    if (!parent) throw new Error(\`Pivot '\${id}' component is not attached.\`);
    const group = new THREE.Group();
    group.name = \`pivot:\${id}\`;
    group.position.fromArray(definition.origin);
    parent.add(group);
    component.position.sub(group.position);
    group.add(component);
    pivotControllers.set(id, {
      group,
      definition,
      basePosition: group.position.clone(),
      baseQuaternion: group.quaternion.clone()
    });
    nodes.set(id, group);
  };

${pivots}

${sockets}

  const applyPivot = (pivotId: string, progress: number) => {
    const controller = pivotControllers.get(pivotId);
    if (!controller) throw new Error(\`Unknown pivot '\${pivotId}'.\`);
    const { group, definition, basePosition, baseQuaternion } = controller;
    const normalized = THREE.MathUtils.clamp(progress, 0, 1);
    const baseline = THREE.MathUtils.clamp(0, definition.min, definition.max);
    const endpoint = Math.abs(definition.max - baseline) >= Math.abs(definition.min - baseline)
      ? definition.max
      : definition.min;
    const value = THREE.MathUtils.lerp(baseline, endpoint, normalized);
    const axis = new THREE.Vector3().fromArray(definition.axis).normalize();
    if (definition.kind === 'rotation') {
      group.position.copy(basePosition);
      group.quaternion.copy(baseQuaternion).multiply(
        new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(value))
      );
    } else {
      group.quaternion.copy(baseQuaternion);
      group.position.copy(basePosition).addScaledVector(axis, value);
    }
  };

${animations}

  root.userData.img2threejs = ${runtimeMetadata};
  root.traverse((object) => {
    object.matrixAutoUpdate = true;
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return {
    root,
    materials,
    nodes,
    sockets: runtimeSockets,
    animations,
    applyPivot,
    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of materials.values()) material.dispose();
    }
  };
}
`
}

const HEIGHTFIELD_HELPER = `type HeightfieldGeometrySpec = {
  type: 'heightfield';
  columns: number;
  rows: number;
  width: number;
  height: number;
  depth: number;
  heights: number[];
  colors: string[];
};

function createHeightfieldGeometry(spec: HeightfieldGeometrySpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const vertexColors: number[] = [];
  const indices: number[] = [];
  const frontCount = spec.columns * spec.rows;

  for (let layer = 0; layer < 2; layer += 1) {
    for (let row = 0; row < spec.rows; row += 1) {
      for (let column = 0; column < spec.columns; column += 1) {
        const sample = row * spec.columns + column;
        const x = (column / (spec.columns - 1) - 0.5) * spec.width;
        const y = (0.5 - row / (spec.rows - 1)) * spec.height;
        const z = layer === 0 ? -spec.depth / 2 + spec.heights[sample] * spec.depth : -spec.depth / 2;
        positions.push(x, y, z);
        const color = new THREE.Color(spec.colors[sample] ?? '#808080');
        vertexColors.push(color.r, color.g, color.b);
      }
    }
  }

  for (let row = 0; row < spec.rows - 1; row += 1) {
    for (let column = 0; column < spec.columns - 1; column += 1) {
      const a = row * spec.columns + column;
      const b = a + 1;
      const c = a + spec.columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      indices.push(frontCount + a, frontCount + b, frontCount + c);
      indices.push(frontCount + b, frontCount + d, frontCount + c);
    }
  }

  const perimeter: number[] = [];
  for (let column = 0; column < spec.columns; column += 1) perimeter.push(column);
  for (let row = 1; row < spec.rows; row += 1) perimeter.push(row * spec.columns + spec.columns - 1);
  for (let column = spec.columns - 2; column >= 0; column -= 1) perimeter.push((spec.rows - 1) * spec.columns + column);
  for (let row = spec.rows - 2; row > 0; row -= 1) perimeter.push(row * spec.columns);
  for (let index = 0; index < perimeter.length; index += 1) {
    const a = perimeter[index];
    const b = perimeter[(index + 1) % perimeter.length];
    indices.push(a, b, frontCount + a, b, frontCount + b, frontCount + a);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
`

const COLOR_RAMP_HELPER = `type HeightColorRampSpec = {
  axis: 'y';
  min: number;
  max: number;
  stops: Array<{ position: number; color: string }>;
};

function configureHeightColorRamp(material: THREE.Material, ramp: HeightColorRampSpec): void {
  const glslFloat = (value: number): string =>
    Number.isInteger(value) ? value.toFixed(1) : String(value);
  const stops = ramp.stops.map((stop) => {
    const color = new THREE.Color(stop.color).convertSRGBToLinear();
    return { position: stop.position, color };
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.img2threejsRampMin = { value: ramp.min };
    shader.uniforms.img2threejsRampMax = { value: ramp.max };
    shader.vertexShader = 'varying float img2threejsRampY;\\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\\nimg2threejsRampY = (modelMatrix * vec4(transformed, 1.0)).y;'
    );
    const mixes = stops.slice(1).map((stop, index) => {
      const previous = stops[index];
      return \`img2threejsRampColor = mix(img2threejsRampColor, vec3(\${glslFloat(stop.color.r)}, \${glslFloat(stop.color.g)}, \${glslFloat(stop.color.b)}), smoothstep(\${glslFloat(previous.position)}, \${glslFloat(stop.position)}, img2threejsRampT));\`;
    }).join('\\n');
    shader.fragmentShader = 'varying float img2threejsRampY;\\nuniform float img2threejsRampMin;\\nuniform float img2threejsRampMax;\\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        \`#include <color_fragment>
float img2threejsRampT = clamp((img2threejsRampY - img2threejsRampMin) / (img2threejsRampMax - img2threejsRampMin), 0.0, 1.0);
vec3 img2threejsRampColor = vec3(\${glslFloat(stops[0].color.r)}, \${glslFloat(stops[0].color.g)}, \${glslFloat(stops[0].color.b)});
\${mixes}
diffuseColor.rgb *= img2threejsRampColor;\`
      );
  };
  material.customProgramCacheKey = () => \`img2threejs-color-ramp:\${JSON.stringify(ramp)}\`;
}
`

function geometryFactory(component: SculptSpec['components'][number]): string {
  const geometry = component.geometry
  if (!geometry) return PRIMITIVE_FACTORIES[component.primitive]
  switch (geometry.type) {
    case 'heightfield':
      return `createHeightfieldGeometry(${JSON.stringify(geometry)})`
    case 'rounded-box':
      return `new RoundedBoxGeometry(${geometry.width}, ${geometry.height}, ${geometry.depth}, ${geometry.segments}, ${geometry.radius})`
    case 'torus-arc':
      return `new THREE.TorusGeometry(${geometry.radius}, ${geometry.tube}, ${geometry.radialSegments}, ${geometry.tubularSegments}, ${geometry.arc})`
    case 'extrude-shape': {
      const [first, ...rest] = geometry.points
      const lines = rest.map((point) => `shape.lineTo(${point[0]}, ${point[1]});`).join(' ')
      return `(() => { const shape = new THREE.Shape(); shape.moveTo(${first[0]}, ${first[1]}); ${lines} shape.closePath(); const geometry = new THREE.ExtrudeGeometry(shape, ${JSON.stringify({
        depth: geometry.depth,
        bevelEnabled: geometry.bevelEnabled,
        bevelThickness: geometry.bevelThickness,
        bevelSize: geometry.bevelSize,
        bevelSegments: geometry.bevelSegments,
        curveSegments: geometry.curveSegments
      })}); geometry.center(); return geometry; })()`
    }
  }
}

function safeVariable(id: string): string {
  return `component_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

function safeMaterialVariable(id: string): string {
  return `material_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

function toPascalCase(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
    .replace(/[^\x00-\x7F]/g, '')
  return normalized && /^[A-Za-z]/.test(normalized) ? normalized : 'Procedural'
}

export function createDeterministicComparisonSvg(spec: SculptSpec, score: number): string {
  const componentRows = spec.components.slice(0, 12).map((component, index) => {
    const width = Math.max(24, Math.min(180, component.transform.scale[0] * 50))
    const height = Math.max(16, Math.min(60, component.transform.scale[1] * 28))
    const x = 325 + (index % 3) * 150
    const y = 90 + Math.floor(index / 3) * 88
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#7c3aed" fill-opacity="${0.55 + Math.min(component.confidence, 1) * 0.4}"/><text x="${x}" y="${y + height + 18}" font-size="12" fill="#334155">${escapeXml(component.name)}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="520" viewBox="0 0 920 520">
  <rect width="920" height="520" fill="#f8fafc"/>
  <rect x="24" y="24" width="260" height="472" rx="20" fill="#fff" stroke="#cbd5e1"/>
  <text x="48" y="64" font-family="system-ui" font-size="20" font-weight="700" fill="#0f172a">Reference evidence</text>
  <text x="48" y="102" font-family="system-ui" font-size="14" fill="#475569">Route: ${escapeXml(spec.route)}</text>
  <text x="48" y="130" font-family="system-ui" font-size="14" fill="#475569">Components: ${spec.components.length}</text>
  <text x="48" y="158" font-family="system-ui" font-size="14" fill="#475569">Details: ${spec.details.length}</text>
  <text x="48" y="186" font-family="system-ui" font-size="14" fill="#475569">Required views: ${spec.qualityContract.requiredViews.length}</text>
  <rect x="48" y="222" width="208" height="12" rx="6" fill="#e2e8f0"/>
  <rect x="48" y="222" width="${208 * score}" height="12" rx="6" fill="#14b8a6"/>
  <text x="48" y="260" font-family="system-ui" font-size="14" font-weight="600" fill="#0f172a">Deterministic score ${(score * 100).toFixed(0)}%</text>
  <text x="320" y="64" font-family="system-ui" font-size="20" font-weight="700" fill="#0f172a">Procedural projection evidence</text>
  ${componentRows}
  <text x="320" y="486" font-family="system-ui" font-size="12" fill="#64748b">Fallback projection only — browser render requires platform Sandbox Jobs.</text>
</svg>`
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }
    return entities[char] ?? char
  })
}
