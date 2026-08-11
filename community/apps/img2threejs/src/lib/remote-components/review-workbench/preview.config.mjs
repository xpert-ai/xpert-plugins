import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')

const projectId = '10000000-0000-4000-8000-000000000001'
const runId = '20000000-0000-4000-8000-000000000001'
let generatedSceneSnapshot
let nextProjectNumber = 3
let nextImageNumber = 3

const stages = [
  'blockout',
  'structural-pass',
  'form-refinement',
  'material-pass',
  'surface-pass',
  'lighting-pass',
  'interaction-pass',
  'optimization-pass'
].map((stage, index) => ({
  stage,
  status: 'passed',
  score: 0.91 + index * 0.01,
  checks: [{
    code: `${stage}.mock_gate`,
    passed: true,
    detail: 'Deterministic mock gate passed.'
  }]
}))

const primaryProject = {
  id: projectId,
  name: 'Clockwork Fox',
  route: 'character',
  modelingMode: 'semantic-3d',
  status: 'review_required',
  revision: 12,
  confidence: 0.91,
  humanReviewStatus: 'pending',
  nextDecision: 'continue',
  updatedAt: '2026-07-25T08:00:00.000Z'
}

export default {
  title: 'Image to Three.js · Local Mock',
  workspaceRoot: pluginRoot,
  instanceId: 'img2threejs-review-preview',
  component: {
    root: componentRoot,
    runtime: 'react'
  },
  hostContext: {
    manifest: { key: 'img2threejs.review-workbench' },
    payload: {},
    initialQuery: { page: 1, pageSize: 20, parameters: {} },
    locale: 'en-US',
    theme: {
      mode: 'light',
      tokens: {
        background: '#f4f2ed',
        foreground: '#171717',
        primary: '#6d4aff'
      }
    },
    debug: { enabled: false, production: true }
  },
  state: {
    projects: [
      primaryProject,
      {
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Studio Task Lamp',
        route: 'object',
        modelingMode: 'semantic-3d',
        status: 'spec_ready',
        revision: 4,
        confidence: 0.84,
        humanReviewStatus: 'pending',
        nextDecision: 'continue',
        updatedAt: '2026-07-24T11:30:00.000Z'
      }
    ],
    selected: {
      project: {
        projectId,
        runId,
        revision: 12,
        runRevision: 9,
        status: 'review_required',
        currentStage: 'optimization-pass',
        completedStages: stages.map((item) => item.stage),
        deterministicStatus: 'passed',
        visualStatus: 'pending_human',
        humanReviewStatus: 'pending',
        nextDecision: 'continue',
        failureCodes: [],
        cursor: 'preview:12:9',
        nextAction: 'submit_review',
        name: 'Clockwork Fox',
        route: 'character',
        modelingMode: 'semantic-3d',
        confidence: 0.91
      },
      images: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          label: 'Front reference',
          view: 'front',
          admissionStatus: 'admitted',
          sha256: '1'.repeat(64),
          width: 1024,
          height: 1024,
          confidence: 1,
          previewFileKey: 'reference-front.svg',
          previewUrl: '/__mock/reference-front.svg'
        },
        {
          id: '30000000-0000-4000-8000-000000000002',
          label: 'Three-quarter reference',
          view: 'three-quarter',
          admissionStatus: 'admitted',
          sha256: '2'.repeat(64),
          width: 1024,
          height: 1024,
          confidence: 1,
          previewFileKey: 'reference-three-quarter.svg',
          previewUrl: '/__mock/reference-three-quarter.svg'
        }
      ],
      stages,
      viewerScene: {
        schemaVersion: '1.0.0',
        projectName: 'Clockwork Fox',
        route: 'character',
        materials: [
          {
            id: 'fox-orange',
            type: 'standard',
            baseColor: '#f97316',
            roughness: 0.58,
            metalness: 0.08,
            opacity: 1,
            transparent: false,
            vertexColors: false
          },
          {
            id: 'fox-cream',
            type: 'standard',
            baseColor: '#ffedd5',
            roughness: 0.72,
            metalness: 0,
            opacity: 1,
            transparent: false,
            vertexColors: false
          },
          {
            id: 'fox-dark',
            type: 'standard',
            baseColor: '#1e293b',
            roughness: 0.45,
            metalness: 0.15,
            opacity: 1,
            transparent: false,
            vertexColors: false
          }
        ],
        components: [
          {
            id: 'body',
            parentId: null,
            name: 'Body',
            primitive: 'sphere',
            geometry: null,
            materialId: 'fox-orange',
            position: [0, 0.05, 0],
            rotation: [0, 0, 0],
            scale: [1.25, 1.45, 0.9]
          },
          {
            id: 'head',
            parentId: null,
            name: 'Head',
            primitive: 'sphere',
            geometry: null,
            materialId: 'fox-orange',
            position: [0, 1.55, 0],
            rotation: [0, 0, 0],
            scale: [1.05, 0.92, 0.86]
          },
          {
            id: 'muzzle',
            parentId: 'head',
            name: 'Muzzle',
            primitive: 'sphere',
            geometry: null,
            materialId: 'fox-cream',
            position: [0, -0.15, 0.48],
            rotation: [0, 0, 0],
            scale: [0.58, 0.36, 0.44]
          },
          {
            id: 'nose',
            parentId: 'head',
            name: 'Nose',
            primitive: 'sphere',
            geometry: null,
            materialId: 'fox-dark',
            position: [0, -0.06, 0.82],
            rotation: [0, 0, 0],
            scale: [0.18, 0.13, 0.14]
          },
          {
            id: 'left-ear',
            parentId: 'head',
            name: 'Left ear',
            primitive: 'cone',
            geometry: null,
            materialId: 'fox-orange',
            position: [-0.55, 0.76, 0],
            rotation: [0, 0, -0.12],
            scale: [0.46, 0.86, 0.42]
          },
          {
            id: 'right-ear',
            parentId: 'head',
            name: 'Right ear',
            primitive: 'cone',
            geometry: null,
            materialId: 'fox-orange',
            position: [0.55, 0.76, 0],
            rotation: [0, 0, 0.12],
            scale: [0.46, 0.86, 0.42]
          },
          {
            id: 'tail',
            parentId: null,
            name: 'Tail',
            primitive: 'capsule',
            geometry: null,
            materialId: 'fox-orange',
            position: [1.05, 0.15, -0.25],
            rotation: [0.2, 0, -0.8],
            scale: [0.72, 1.42, 0.72]
          }
        ]
      },
      artifact: {
        codeVersionId: '40000000-0000-4000-8000-000000000001',
        codeSha256: 'a'.repeat(64),
        sourceAsset: {
          name: 'model-v1.ts',
          mimeType: 'text/typescript',
          size: 8192,
          sha256: 'a'.repeat(64)
        },
        comparisonAsset: {
          name: 'comparison-browser.png',
          mimeType: 'image/png',
          size: 4096,
          sha256: 'b'.repeat(64)
        },
        comparisonPreviewUrl: '/__mock/comparison.svg',
        modelAsset: null,
        modelPreviewUrl: null,
        visualReview: {
          status: 'pending_human',
          evidenceKind: 'browser_render',
          renderStatus: 'succeeded'
        },
        renderReport: {
          status: 'succeeded',
          quality: passedFidelityQuality(),
          correction: passedCorrection()
        },
        capabilities: {
          workspaceFiles: { available: true, code: 'available' },
          artifacts: {
            available: false,
            code: 'runtime_unavailable',
            reason: 'The Artifacts runtime is not registered in this local mock host.'
          },
          sandboxRender: {
            available: true,
            code: 'available',
            action: 'img2threejs.review-render',
            actionVersion: '1.0.0',
            runtimeProfile: 'browser/playwright-1.61/v1',
            workerCount: 1
          }
        }
      }
    },
    actions: [],
    clientCommands: []
  },
  async handleRequest(message, { state }) {
    if (message.type === 'requestFileAccess') {
      const fileKey = typeof message.fileKey === 'string' ? message.fileKey : ''
      return {
        result: {
          url: `/__mock/${encodeURIComponent(fileKey)}`,
          expiresAt: '2026-07-25T08:06:00.000Z'
        }
      }
    }
    if (message.type === 'requestData') {
      const search = typeof message.query?.search === 'string'
        ? message.query.search.trim().toLowerCase()
        : ''
      const filtered = state.projects.filter((project) =>
        !search || project.name.toLowerCase().includes(search)
      )
      const selectedProjectId = message.query?.parameters?.projectId
      return {
        data: {
          items: filtered,
          total: filtered.length,
          meta: {
            tableKey: 'projects',
            table: {
              key: 'projects',
              items: filtered,
              total: filtered.length,
              page: 1,
              pageSize: 20
            },
            selected: selectedProjectId === state.selected.project.projectId
              ? state.selected
              : null
          }
        }
      }
    }
    if (message.type === 'invokeClientCommand') {
      if (message.commandKey !== 'assistant.chat.send_message') {
        throw new Error(`Unsupported preview client command '${message.commandKey}'.`)
      }
      const text = typeof message.payload?.text === 'string' ? message.payload.text : ''
      const selected = state.selected
      if (!selected || !text.includes(selected.project.projectId)) {
        throw new Error('Agent generation request does not target the selected project exactly.')
      }
      if (
        !text.includes('img2threejs-semantic-modeling') ||
        !text.includes('regenerate_from_references') ||
        !selected.images.every((image) => text.includes(image.id))
      ) {
        throw new Error('Agent generation request does not bind the modeling Skill to admitted evidence.')
      }
      state.clientCommands.push({
        commandKey: message.commandKey,
        payload: structuredClone(message.payload),
        at: '2026-07-25T08:02:00.000Z'
      })
      if (!generatedSceneSnapshot) {
        generatedSceneSnapshot = mockSemanticRocketScene(selected.project.name, selected.project.route)
      }
      selected.project.runId = `20000000-0000-4000-8000-${String(nextProjectNumber).padStart(12, '0')}`
      selected.project.runRevision = stages.length + 1
      selected.project.revision += stages.length + 2
      selected.project.status = 'review_required'
      selected.project.currentStage = 'optimization-pass'
      selected.project.completedStages = stages.map((item) => item.stage)
      selected.project.deterministicStatus = 'passed'
      selected.project.visualStatus = 'pending_human'
      selected.project.nextDecision = 'continue'
      selected.project.nextAction = 'submit_review'
      selected.project.confidence = 0.92
      selected.project.cursor = `preview:${selected.project.revision}:${selected.project.runRevision}`
      selected.stages = structuredClone(stages)
      selected.viewerScene = structuredClone(generatedSceneSnapshot)
      selected.artifact = completedArtifact()
      updateProjectRow(state)
      return {
        result: {
          success: true,
          status: 'sent',
          clientMessageId: message.payload?.clientMessageId
        }
      }
    }
    if (message.type === 'executeFileAction') {
      if (message.actionKey !== 'upload_reference') {
        throw new Error(`Unsupported preview file action '${message.actionKey}'.`)
      }
      const input = message.input ?? {}
      const file = message.file ?? {}
      if (!state.selected || input.projectId !== state.selected.project.projectId) {
        throw new Error('Preview upload target does not match the selected project.')
      }
      const imageId = `30000000-0000-4000-8000-${String(nextImageNumber++).padStart(12, '0')}`
      const fileName = typeof file.name === 'string' && file.name ? file.name : `reference-${nextImageNumber}.png`
      state.selected.project.revision += 1
      state.selected.project.status = 'awaiting_spec'
      state.selected.project.cursor = `preview:${state.selected.project.revision}:0`
      state.selected.project.nextAction = 'start_generation'
      state.selected.images.push({
        id: imageId,
        label: typeof input.label === 'string' ? input.label : fileName,
        view: typeof input.view === 'string' ? input.view : 'front',
        admissionStatus: 'admitted',
        sha256: String(nextImageNumber).repeat(64).slice(0, 64),
        width: 1024,
        height: 1024,
        confidence: 1,
        previewFileKey: fileName.includes('three') ? 'reference-three-quarter.svg' : 'reference-front.svg',
        previewUrl: fileName.includes('three') ? '/__mock/reference-three-quarter.svg' : '/__mock/reference-front.svg'
      })
      updateProjectRow(state)
      state.actions.push({
        actionKey: message.actionKey,
        input: { ...input, fileName },
        at: '2026-07-25T08:01:00.000Z'
      })
      return {
        result: {
          success: true,
          data: {
            projectId: state.selected.project.projectId,
            imageId,
            revision: state.selected.project.revision,
            admissionStatus: 'admitted'
          }
        }
      }
    }
    if (message.type === 'executeAction') {
      const input = message.input ?? {}
      state.actions.push({
        actionKey: message.actionKey,
        input,
        at: '2026-07-25T08:01:00.000Z'
      })
      if (message.actionKey === 'create_project') {
        const suffix = String(nextProjectNumber++).padStart(12, '0')
        const nextProjectId = `10000000-0000-4000-8000-${suffix}`
        const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Untitled project'
        const route = input.route === 'character' ? 'character' : 'object'
        const modelingMode = input.modelingMode === 'relief' ? 'relief' : 'semantic-3d'
        generatedSceneSnapshot = modelingMode === 'semantic-3d'
          ? mockSemanticRocketScene(name, route)
          : mockImageReliefScene(name, route)
        const project = {
          id: nextProjectId,
          name,
          route,
          modelingMode,
          status: 'draft',
          revision: 1,
          confidence: 0,
          humanReviewStatus: 'pending',
          nextDecision: 'request-input',
          updatedAt: '2026-07-25T08:01:00.000Z'
        }
        state.projects.unshift(project)
        state.selected = {
          project: {
            projectId: nextProjectId,
            runId: null,
            revision: 1,
            runRevision: null,
            status: 'draft',
            currentStage: null,
            completedStages: [],
            deterministicStatus: 'pending',
            visualStatus: 'pending',
            humanReviewStatus: 'pending',
            nextDecision: 'request-input',
            failureCodes: [],
            cursor: 'preview:1:0',
            nextAction: 'upload_reference',
            name,
            route,
            modelingMode,
            confidence: 0
          },
          images: [],
          stages: [],
          viewerScene: null,
          artifact: emptyArtifact()
        }
        return {
          result: {
            success: true,
            data: { projectId: nextProjectId, revision: 1, status: 'draft' }
          }
        }
      } else if (message.actionKey === 'start_generation') {
        if (!state.selected || state.selected.images.length === 0) {
          throw new Error('At least one admitted reference is required.')
        }
        if (state.selected.project.modelingMode === 'semantic-3d') {
          return {
            result: {
              success: true,
              data: {
                projectId: state.selected.project.projectId,
                revision: state.selected.project.revision,
                status: state.selected.project.status,
                semanticAnalysisOwner: 'agent-chat',
                nextAction: 'ask_agent_to_analyze_evidence',
                suggestedPrompt:
                  [
                    'Use the installed img2threejs-semantic-modeling Skill for this regeneration.',
                    `Trusted host context: ${JSON.stringify({
                      intent: 'regenerate_from_references',
                      projectId: state.selected.project.projectId,
                      baseRevision: state.selected.project.revision,
                      admittedEvidenceIds: state.selected.images.map((image) => image.id)
                    })}`
                  ].join('\n'),
                clientCommand: {
                  commandKey: 'assistant.chat.send_message',
                  payload: {
                    text: [
                      'Use the installed img2threejs-semantic-modeling Skill for this regeneration.',
                      `Trusted host context: ${JSON.stringify({
                        intent: 'regenerate_from_references',
                        projectId: state.selected.project.projectId,
                        baseRevision: state.selected.project.revision,
                        admittedEvidenceIds: state.selected.images.map((image) => image.id)
                      })}`
                    ].join('\n'),
                    state: {
                      img2threejs: {
                        intent: 'regenerate_from_references',
                        projectId: state.selected.project.projectId,
                        expectedRevision: state.selected.project.revision,
                        evidenceIds: state.selected.images.map((image) => image.id)
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (!generatedSceneSnapshot) throw new Error('The preview generated scene fixture is unavailable.')
        state.selected.project.runId = `20000000-0000-4000-8000-${String(nextProjectNumber).padStart(12, '0')}`
        state.selected.project.runRevision = 1
        state.selected.project.revision += 1
        state.selected.project.status = 'review_required'
        state.selected.project.currentStage = 'blockout'
        state.selected.project.completedStages = ['blockout']
        state.selected.project.deterministicStatus = 'passed'
        state.selected.project.nextDecision = 'continue'
        state.selected.project.nextAction = 'advance_generation'
        state.selected.project.cursor = `preview:${state.selected.project.revision}:1`
        state.selected.stages = [makePassedStage('blockout', 0)]
        updateProjectRow(state)
        return {
          result: {
            success: true,
            data: {
              projectId: state.selected.project.projectId,
              runId: state.selected.project.runId,
              revision: state.selected.project.revision,
              runRevision: 1,
              status: 'review_required'
            }
          }
        }
      } else if (message.actionKey === 'advance_generation') {
        const completed = state.selected?.project.completedStages.length ?? 0
        const nextStage = stages[completed]?.stage
        if (!state.selected || !nextStage || state.selected.project.runRevision === null) {
          throw new Error('There is no remaining preview stage.')
        }
        state.selected.project.runRevision += 1
        state.selected.project.revision += 1
        state.selected.project.currentStage = nextStage
        state.selected.project.completedStages.push(nextStage)
        state.selected.stages.push(makePassedStage(nextStage, completed))
        const finished = state.selected.project.completedStages.length === stages.length
        state.selected.project.status = 'review_required'
        state.selected.project.nextDecision = 'continue'
        state.selected.project.nextAction = finished ? 'submit_review' : 'advance_generation'
        state.selected.project.visualStatus = finished ? 'pending_human' : 'pending'
        state.selected.project.cursor = `preview:${state.selected.project.revision}:${state.selected.project.runRevision}`
        if (finished) {
          state.selected.viewerScene = structuredClone(generatedSceneSnapshot)
          state.selected.artifact = completedArtifact()
        }
        updateProjectRow(state)
        return {
          result: {
            success: true,
            data: {
              projectId: state.selected.project.projectId,
              revision: state.selected.project.revision,
              runRevision: state.selected.project.runRevision,
              status: state.selected.project.status,
              completedStages: state.selected.project.completedStages
            }
          }
        }
      } else if (message.actionKey === 'export_artifact') {
        if (!state.selected?.artifact.sourceAsset) throw new Error('No generated package is available.')
        return {
          result: {
            success: true,
            data: {
              projectId: state.selected.project.projectId,
              fileName: state.selected.artifact.sourceAsset.name,
              exported: true
            }
          }
        }
      } else if (message.actionKey === 'submit_review') {
        state.selected.project.runRevision += 1
        state.selected.project.humanReviewStatus = input.humanReviewStatus
        state.selected.project.nextDecision = input.decision
        state.selected.project.status = input.decision === 'stop' ? 'completed' : 'review_required'
      } else if (message.actionKey === 'cancel_run') {
        state.selected.project.runRevision += 1
        state.selected.project.status = 'cancelled'
        state.selected.project.nextDecision = 'stop'
      } else if (message.actionKey === 'retry_run') {
        state.selected.project.runRevision += 1
        state.selected.project.status = 'queued'
        state.selected.project.nextDecision = 'continue'
      } else {
        throw new Error(`Unsupported preview action '${message.actionKey}'.`)
      }
      updateProjectRow(state)
      return {
        result: {
          success: true,
          data: {
            projectId: state.selected.project.projectId,
            runRevision: state.selected.project.runRevision,
            status: state.selected.project.status
          }
        }
      }
    }
    throw new Error(`Unsupported preview request '${message.type}'.`)
  }
}

function makePassedStage(stage, index) {
  return {
    stage,
    status: 'passed',
    score: 0.91 + index * 0.01,
    checks: [{
      code: `${stage}.mock_gate`,
      passed: true,
      detail: 'Deterministic mock gate passed.'
    }]
  }
}

function mockImageReliefScene(projectName, route) {
  const columns = 8
  const rows = 8
  return {
    schemaVersion: '1.0.0',
    projectName,
    route,
    materials: [{
      id: 'image-surface',
      type: 'standard',
      baseColor: '#ffffff',
      roughness: 0.72,
      metalness: 0.02,
      opacity: 1,
      transparent: false,
      vertexColors: true
    }],
    components: [{
      id: 'image-relief',
      parentId: null,
      name: 'Image-derived relief',
      primitive: 'custom',
      geometry: {
        type: 'heightfield',
        columns,
        rows,
        width: 2.4,
        height: 2.4,
        depth: 0.42,
        heights: Array.from({ length: columns * rows }, (_, index) => {
          const x = index % columns
          const y = Math.floor(index / columns)
          return Number((0.12 + Math.max(0, 1 - Math.hypot(x - 3.5, y - 3.5) / 5) * 0.86).toFixed(4))
        }),
        colors: Array.from({ length: columns * rows }, (_, index) =>
          index % columns < 4 ? '#7c3aed' : '#22d3ee'
        )
      },
      materialId: 'image-surface',
      position: [0, 1.2, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }]
  }
}

function mockSemanticRocketScene(projectName, route) {
  return {
    schemaVersion: '1.0.0',
    projectName,
    route,
    materials: [
      {
        id: 'rocket-shell',
        type: 'physical',
        baseColor: '#f8fafc',
        roughness: 0.3,
        metalness: 0.36,
        opacity: 1,
        transparent: false,
        vertexColors: false,
        clearcoat: 0.48,
        clearcoatRoughness: 0.22
      },
      {
        id: 'rocket-accent',
        type: 'standard',
        baseColor: '#7c3aed',
        roughness: 0.44,
        metalness: 0.18,
        opacity: 1,
        transparent: false,
        vertexColors: false
      },
      {
        id: 'rocket-window',
        type: 'physical',
        baseColor: '#38bdf8',
        roughness: 0.12,
        metalness: 0.08,
        opacity: 0.74,
        transparent: true,
        vertexColors: false,
        clearcoat: 0.8,
        clearcoatRoughness: 0.08
      }
    ],
    components: [
      {
        id: 'rocket-body',
        parentId: null,
        name: 'Rocket body',
        primitive: 'capsule',
        geometry: null,
        materialId: 'rocket-shell',
        position: [0, 1.25, 0],
        rotation: [0, 0, 0],
        scale: [0.72, 1.7, 0.72]
      },
      {
        id: 'rocket-nose',
        parentId: 'rocket-body',
        name: 'Nose cone',
        primitive: 'cone',
        geometry: null,
        materialId: 'rocket-accent',
        position: [0, 1.58, 0],
        rotation: [0, 0, 0],
        scale: [0.9, 0.88, 0.9]
      },
      {
        id: 'rocket-window',
        parentId: 'rocket-body',
        name: 'Front viewport',
        primitive: 'sphere',
        geometry: null,
        materialId: 'rocket-window',
        position: [0, 0.35, 0.64],
        rotation: [0, 0, 0],
        scale: [0.42, 0.42, 0.12]
      },
      {
        id: 'left-fin',
        parentId: 'rocket-body',
        name: 'Left stabilizer',
        primitive: 'box',
        geometry: null,
        materialId: 'rocket-accent',
        position: [-0.78, -1.02, 0],
        rotation: [0, 0, -0.28],
        scale: [0.58, 0.72, 0.16]
      },
      {
        id: 'right-fin',
        parentId: 'rocket-body',
        name: 'Right stabilizer',
        primitive: 'box',
        geometry: null,
        materialId: 'rocket-accent',
        position: [0.78, -1.02, 0],
        rotation: [0, 0, 0.28],
        scale: [0.58, 0.72, 0.16]
      },
      {
        id: 'engine-ring',
        parentId: 'rocket-body',
        name: 'Engine ring',
        primitive: 'cylinder',
        geometry: null,
        materialId: 'rocket-accent',
        position: [0, -1.63, 0],
        rotation: [0, 0, 0],
        scale: [0.78, 0.24, 0.78]
      }
    ]
  }
}

function updateProjectRow(state) {
  if (!state.selected) return
  const project = state.projects.find((item) => item.id === state.selected.project.projectId)
  if (!project) return
  project.revision = state.selected.project.revision
  project.status = state.selected.project.status
  project.confidence = state.selected.project.confidence
  project.humanReviewStatus = state.selected.project.humanReviewStatus
  project.nextDecision = state.selected.project.nextDecision
}

function emptyArtifact() {
  return {
    codeVersionId: null,
    codeSha256: null,
    sourceAsset: null,
    comparisonAsset: null,
    comparisonPreviewUrl: null,
    modelAsset: null,
    modelPreviewUrl: null,
    visualReview: null,
    renderReport: null,
    capabilities: {
      workspaceFiles: { available: true, code: 'available' },
      artifacts: { available: false, code: 'runtime_unavailable', reason: 'Artifacts are unavailable in this local mock.' },
      sandboxRender: {
        available: true,
        code: 'available',
        action: 'img2threejs.review-render',
        actionVersion: '1.0.0',
        runtimeProfile: 'browser/playwright-1.61/v1',
        workerCount: 1
      }
    }
  }
}

function completedArtifact() {
  return {
    ...emptyArtifact(),
    codeVersionId: '40000000-0000-4000-8000-000000000099',
    codeSha256: 'c'.repeat(64),
    sourceAsset: {
      name: 'model-v1.ts',
      mimeType: 'text/typescript',
      size: 8192,
      sha256: 'c'.repeat(64)
    },
    comparisonAsset: {
      name: 'comparison-browser.png',
      mimeType: 'image/png',
      size: 4096,
      sha256: 'd'.repeat(64)
    },
    comparisonPreviewUrl: '/__mock/comparison.svg',
    visualReview: {
      status: 'pending_human',
      evidenceKind: 'browser_render',
      renderStatus: 'succeeded'
    },
    renderReport: {
      status: 'succeeded',
      quality: passedFidelityQuality(),
      correction: passedCorrection()
    }
  }
}

function passedFidelityQuality() {
  return {
    triangles: 4280,
    drawCalls: 12,
    runtimeMeshCount: 24,
    minimumRuntimeMeshCount: 16,
    maximumTriangles: 10000,
    maximumDrawCalls: 20,
    referenceAlignment: {
      evidenceId: '30000000-0000-4000-8000-000000000001',
      view: 'front',
      maskConfidence: 0.94,
      silhouetteIoU: 0.86,
      scaleScore: 0.91,
      edgeScore: 0.79,
      perceptualScore: 0.74,
      hardGateEligible: true,
      passed: true
    },
    featureResults: [{
      id: 'face_placement',
      label: 'Face feature placement',
      criticality: 'critical',
      metric: 'edge',
      score: 0.84,
      threshold: 0.7,
      passed: true
    }],
    multiAngle: {
      minimumSilhouetteRetention: 0.1,
      minimumVolumeAxisRatio: 0.02,
      silhouetteRetention: 0.68,
      volumeAxisRatio: 0.54,
      degenerateView: false,
      passed: true
    },
    failureCodes: [],
    passed: true
  }
}

function passedCorrection() {
  return {
    iteration: 1,
    maximumIterations: 4,
    defectSignature: 'success',
    repeatedDefectCount: 0,
    plateauCount: 0,
    terminalReason: 'success',
    recommendedDecision: 'continue'
  }
}
