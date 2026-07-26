const identity = { rotation: [0, 0, 0], scale: [1, 1, 1] }

export function crownChestSpec(evidenceId) {
  const component = (input) => ({
    parentId: null,
    semanticType: 'attachment',
    primitive: 'custom',
    deformable: false,
    evidenceIds: [evidenceId],
    confidence: 0.96,
    ...input
  })
  const rounded = (width, height, depth, radius = 0.025, segments = 3) => ({
    type: 'rounded-box',
    width,
    height,
    depth,
    segments,
    radius
  })
  const bracketPositions = [
    [-0.45, -0.39, -0.35], [-0.45, -0.39, 0.35],
    [0.45, -0.39, -0.35], [0.45, -0.39, 0.35]
  ]
  const lidBracketPositions = [
    [-0.45, 0.15, -0.35], [-0.45, 0.15, 0.35],
    [0.45, 0.15, -0.35], [0.45, 0.15, 0.35]
  ]
  const components = [
    component({
      id: 'body',
      name: 'Rounded enamel chest body',
      semanticType: 'primary_form',
      geometry: rounded(1, 0.6, 0.82, 0.09, 6),
      transform: { ...identity, position: [0, -0.175, 0] },
      materialId: 'enamel'
    }),
    component({
      id: 'lid',
      name: 'Hinged rounded enamel lid',
      semanticType: 'primary_form',
      geometry: rounded(1.02, 0.34, 0.84, 0.09, 6),
      transform: { ...identity, position: [0, 0.235, 0] },
      materialId: 'enamel'
    }),
    ...bracketPositions.map((position, index) => component({
      id: `body_bracket_${index + 1}`,
      name: `Body gold corner bracket ${index + 1}`,
      geometry: rounded(0.18, 0.18, 0.09, 0.02),
      transform: { ...identity, position },
      materialId: 'gold'
    })),
    ...lidBracketPositions.map((position, index) => component({
      id: `lid_bracket_${index + 1}`,
      parentId: 'lid',
      name: `Lid gold corner bracket ${index + 1}`,
      geometry: rounded(0.18, 0.12, 0.09, 0.02),
      transform: { ...identity, position },
      materialId: 'gold'
    })),
    component({
      id: 'latch_backplate',
      name: 'Front latch backplate',
      geometry: rounded(0.22, 0.19, 0.045, 0.018),
      transform: { ...identity, position: [0, -0.01, 0.43] },
      materialId: 'gold'
    }),
    component({
      id: 'latch_clasp',
      parentId: 'latch_backplate',
      name: 'Front latch clasp',
      geometry: rounded(0.1, 0.15, 0.055, 0.02),
      transform: { ...identity, position: [0, 0.02, 0.035] },
      materialId: 'gold'
    }),
    component({
      id: 'side_handle',
      name: 'Gold D-ring side handle',
      geometry: {
        type: 'torus-arc',
        radius: 0.17,
        tube: 0.025,
        radialSegments: 12,
        tubularSegments: 40,
        arc: Math.PI
      },
      transform: {
        position: [0.53, -0.15, 0],
        rotation: [0, Math.PI / 2, 0],
        scale: [1, 1, 1]
      },
      materialId: 'gold'
    }),
    ...[-0.17, 0.17].map((z, index) => component({
      id: `handle_stud_${index + 1}`,
      name: `Handle mounting stud ${index + 1}`,
      primitive: 'cylinder',
      geometry: undefined,
      transform: {
        position: [0.53, -0.15, z],
        rotation: [0, 0, Math.PI / 2],
        scale: [0.08, 0.05, 0.08]
      },
      materialId: 'gold'
    })),
    component({
      id: 'emblem_frame',
      name: 'Dark crown emblem frame',
      geometry: rounded(0.34, 0.27, 0.055, 0.022),
      transform: { ...identity, position: [0, 0.19, 0.445] },
      materialId: 'frame'
    }),
    component({
      id: 'emblem_panel',
      parentId: 'emblem_frame',
      name: 'Emissive crown emblem panel',
      geometry: rounded(0.28, 0.21, 0.03, 0.012),
      transform: { ...identity, position: [0, 0, 0.04] },
      materialId: 'panel'
    }),
    component({
      id: 'crown_glyph',
      parentId: 'emblem_panel',
      name: 'Extruded three-peak crown glyph',
      geometry: {
        type: 'extrude-shape',
        points: [
          [-0.1, -0.055], [0.1, -0.055], [0.1, 0.045], [0.05, -0.005],
          [0, 0.07], [-0.05, -0.005], [-0.1, 0.045]
        ],
        depth: 0.025,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.004,
        bevelSegments: 2,
        curveSegments: 4
      },
      transform: { ...identity, position: [0, 0, 0.04] },
      materialId: 'panel'
    })
  ]

  return {
    schemaVersion: '1.0.0',
    projectName: 'Crown Chest Reference Match',
    route: 'object',
    modelingMode: 'semantic-3d',
    coordinateSystem: { up: 'Y', forward: 'Z-', units: 'meters' },
    referenceCamera: {
      evidenceId,
      view: 'three-quarter',
      projection: 'perspective',
      position: [2.1, 1.25, 2.1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: null,
      framing: { subjectFillRatio: 0.62, tolerance: 0.16 },
      confidence: 0.96
    },
    silhouetteIntent: 'Chunky rounded loot chest with a domed lid, gold corners, front crown emblem, latch, and side D-ring handle.',
    proportions: [{
      subject: 'body',
      relation: 'Width is roughly 1.2 times depth; lid occupies the upper third and overhangs the body slightly.',
      evidenceIds: [evidenceId],
      confidence: 0.96
    }],
    components,
    materials: [
      {
        id: 'enamel',
        name: 'Glossy teal-blue-purple enamel',
        type: 'physical',
        baseColor: '#ffffff',
        roughness: 0.2,
        metalness: 0,
        opacity: 1,
        transparent: false,
        clearcoat: 0.85,
        clearcoatRoughness: 0.1,
        colorRamp: {
          axis: 'y',
          min: -0.5,
          max: 0.42,
          stops: [
            { position: 0, color: '#159c86' },
            { position: 0.3, color: '#1c7fa6' },
            { position: 0.55, color: '#1f3fa0' },
            { position: 0.8, color: '#4a2e9e' },
            { position: 1, color: '#7a2ca6' }
          ]
        },
        textureIntents: []
      },
      {
        id: 'gold',
        name: 'Polished gold hardware',
        type: 'standard',
        baseColor: '#f4c531',
        roughness: 0.26,
        metalness: 1,
        opacity: 1,
        transparent: false,
        textureIntents: []
      },
      {
        id: 'frame',
        name: 'Dark emblem frame',
        type: 'standard',
        baseColor: '#161221',
        roughness: 0.4,
        metalness: 0.45,
        opacity: 1,
        transparent: false,
        textureIntents: []
      },
      {
        id: 'panel',
        name: 'Warm emissive crown panel',
        type: 'standard',
        baseColor: '#ffe6a0',
        emissive: '#ffbc2e',
        emissiveIntensity: 1.1,
        roughness: 0.52,
        metalness: 0,
        opacity: 1,
        transparent: false,
        textureIntents: ['emissive']
      }
    ],
    details: [
      {
        id: 'corner_brackets',
        componentId: 'body',
        kind: 'fastener',
        priority: 'must',
        description: 'Eight polished gold corner brackets frame the body and lid.',
        evidenceIds: [evidenceId],
        acceptance: 'All eight brackets remain readable from the three-quarter view.'
      },
      {
        id: 'crown_emblem',
        componentId: 'crown_glyph',
        kind: 'marking',
        priority: 'must',
        description: 'A warm emissive three-peak crown marks the front center.',
        evidenceIds: [evidenceId],
        acceptance: 'Crown silhouette and warm glow are visible without clipping.'
      },
      {
        id: 'enamel_gradient',
        componentId: 'body',
        kind: 'surface_variation',
        priority: 'must',
        description: 'Glossy enamel transitions from teal low on the body through blue and purple to magenta.',
        evidenceIds: [evidenceId],
        acceptance: 'Height gradient remains saturated in neutral studio lighting.'
      }
    ],
    featureReviewTargets: [
      {
        id: 'chest_silhouette',
        label: 'Rounded chest silhouette',
        evidenceId,
        componentIds: ['body', 'lid'],
        view: 'three-quarter',
        region: { x: 0.08, y: 0.12, width: 0.84, height: 0.76 },
        metric: 'silhouette',
        criticality: 'critical',
        threshold: 0.45,
        confidence: 0.96,
        acceptance: 'Body and lid preserve the rounded chest envelope.'
      },
      {
        id: 'crown_feature',
        label: 'Front crown emblem',
        evidenceId,
        componentIds: ['emblem_frame', 'emblem_panel', 'crown_glyph'],
        view: 'three-quarter',
        region: { x: 0.38, y: 0.28, width: 0.24, height: 0.3 },
        metric: 'edge',
        criticality: 'important',
        threshold: 0.2,
        confidence: 0.93,
        acceptance: 'The front crown emblem remains legible.'
      }
    ],
    runtime: {
      pivots: [{
        id: 'lid_hinge',
        componentId: 'lid',
        name: 'Lid hinge',
        kind: 'rotation',
        origin: [0, 0.06, -0.42],
        axis: [1, 0, 0],
        min: -75,
        max: 0
      }],
      sockets: [{
        id: 'lid_socket',
        componentId: 'lid',
        name: 'Lid attachment socket',
        purpose: 'Attach effects or loot to the opening lid.',
        transform: {
          position: [0, 0.18, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }],
      colliders: [{
        id: 'body_collider',
        componentId: 'body',
        shape: 'box',
        transform: {
          position: [0, -0.175, 0],
          rotation: [0, 0, 0],
          scale: [1, 0.6, 0.82]
        },
        isTrigger: false
      }],
      animationClips: [{
        name: 'open_lid',
        durationSeconds: 2.4,
        pivotIds: ['lid_hinge']
      }]
    },
    qualityContract: {
      minimumEvidenceCoverage: 0.9,
      minimumDeterministicScore: 0.9,
      requireHumanVisualApproval: true,
      maximumTriangles: 150000,
      maximumDrawCalls: 40,
      minimumComponentCount: 16,
      minimumMaterialCount: 4,
      requiredViews: ['front', 'three-quarter'],
      minimumSilhouetteIoU: 0.3,
      minimumScaleScore: 0.65,
      minimumEdgeScore: 0.12,
      minimumPerceptualScore: 0.1,
      minimumReferenceMaskConfidence: 0.2,
      minimumMultiAngleSilhouetteRetention: 0.1,
      minimumVolumeAxisRatio: 0.05,
      maximumCorrectionIterations: 4,
      mustPassStages: 8
    },
    nextDecision: 'continue'
  }
}
