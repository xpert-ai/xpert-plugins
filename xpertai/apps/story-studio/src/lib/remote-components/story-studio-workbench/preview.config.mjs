import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const platformRoot = resolve(componentRoot, '../../../../../../../../xpert')
const demoImage = (name) =>
  `data:image/png;base64,${readFileSync(
    resolve(componentRoot, `../../../../assets/demo-hidden-ledger/${name}`)
  ).toString('base64')}`
const shotImages = {
  package: demoImage('shot-01.png'),
  departure: demoImage('shot-02.png')
}

const projects = [
  project({
    id: 'project-1',
    title: '月港信使',
    premise: '一名信使在被海水淹没的城市中递送人们遗失的记忆。',
    productionFormat: 'vertical_short',
    aspectRatio: '9:16',
    targetDurationSeconds: 90,
    status: 'draft',
    revision: 1,
    tags: ['奇幻', '短剧']
  }),
  project({
    id: 'project-2',
    title: '最后一班列车',
    premise: '末日列车上的乘客必须共同决定唯一能够停靠的终点。',
    productionFormat: 'horizontal_short',
    aspectRatio: '16:9',
    targetDurationSeconds: 600,
    status: 'planning',
    revision: 4,
    tags: ['悬疑']
  }),
  ...Array.from({ length: 20 }, (_, index) =>
    project({
      id: `project-seed-${index + 1}`,
      title: `示例故事 ${String(index + 1).padStart(2, '0')}`,
      premise: '用于验证服务端分页的 Story Studio 示例项目。',
      productionFormat: 'vertical_short',
      aspectRatio: '9:16',
      targetDurationSeconds: 60,
      status: 'draft',
      revision: 1,
      tags: ['分页测试']
    })
  )
]

export { platformRoot }

export default {
  title: 'Story Studio · Remote View Preview',
  frameTitle: 'Story Studio Workbench',
  workspaceRoot: platformRoot,
  instanceId: 'story-studio-preview',
  component: {
    root: componentRoot,
    runtime: 'react',
    title: 'Story Studio Preview'
  },
  hostContext: {
    manifest: { key: 'story_studio_workbench' },
    payload: {},
    initialQuery: {
      page: 1,
      pageSize: 20,
      parameters: {}
    },
    locale: 'zh-Hans',
    theme: {
      mode: 'light',
      tokens: {
        colorBackground: 'oklch(1 0 0)',
        colorForeground: 'oklch(0.21 0.006 285.885)',
        colorCard: 'oklch(1 0 0)',
        colorCardForeground: 'oklch(0.21 0.006 285.885)',
        colorPopover: 'oklch(1 0 0)',
        colorPopoverForeground: 'oklch(0.21 0.006 285.885)',
        colorMuted: 'oklch(0.967 0.001 286.375)',
        colorMutedForeground: 'oklch(0.552 0.016 285.938)',
        colorSecondary: 'oklch(0.967 0.001 286.375)',
        colorSecondaryForeground: 'oklch(0.21 0.006 285.885)',
        colorAccent: 'oklch(0.9619 0.0179 272.314)',
        colorAccentForeground: 'oklch(0.5106 0.2301 276.966)',
        colorBorder: 'oklch(0.92 0.004 286.32)',
        colorInput: 'oklch(0.92 0.004 286.32)',
        colorPrimary: 'oklch(0.51 0.23 277)',
        colorPrimaryForeground: 'oklch(0.985 0 0)',
        colorRing: 'oklch(0.705 0.015 286.067)',
        colorSuccess: 'oklch(0.596 0.145 163.225)',
        colorWarning: 'oklch(0.666 0.179 58.318)',
        radiusMd: '0.5rem',
        radiusLg: '0.625rem'
      }
    },
    debug: { enabled: false, production: true }
  },
  state: {
    projects,
    productionByProject: {
      'project-1': productionFixture()
    },
    handoffByProject: {},
    requestDataCount: 0,
    actions: [],
    notifications: [],
    assistantContext: null,
    assistantMessages: [],
    failNextAction: false
  },
  async handleRequest(message, { state }) {
    if (message.type === 'requestFileAccess') {
      const candidate = Object.values(state.productionByProject)
        .flatMap((production) => [
          ...production.assets.flatMap((asset) => asset.candidates),
          ...production.scenes.flatMap((scene) =>
            scene.shots.flatMap((shot) => shot.candidates)
          )
        ])
        .find((item) => item.id === message.fileKey)
      if (!candidate) {
        throw new Error('Preview media candidate was not found.')
      }
      return {
        data: {
          url:
            candidate.fileUrl ??
            (candidate.kind === 'image'
              ? 'data:image/png;base64,iVBORw0KGgo='
              : 'data:video/mp4;base64,AAAA'),
          expiresAt: '2026-07-25T13:00:00.000Z',
          fileName:
            candidate.originalName ??
            `${candidate.id}.${candidate.kind === 'image' ? 'png' : 'mp4'}`,
          mimeType:
            candidate.mimeType ??
            (candidate.kind === 'image' ? 'image/png' : 'video/mp4'),
          size: candidate.size ?? 4
        }
      }
    }

    if (
      message.type === 'executeFileAction' &&
      message.actionKey === 'upload_asset_image'
    ) {
      const input = message.input ?? {}
      const current = state.projects.find(
        (item) => item.id === input.projectId
      )
      const production = state.productionByProject[input.projectId]
      const asset = production?.assets.find(
        (item) => item.id === input.assetId
      )
      if (!current || !production || !asset) {
        throw new Error('Preview asset was not found.')
      }
      if (current.revision !== input.baseRevision) {
        return revisionConflict(current.revision)
      }
      asset.candidates = asset.candidates.map((candidate) => ({
        ...candidate,
        selected: candidate.kind === 'image' ? false : candidate.selected
      }))
      asset.candidates.push({
        id: input.candidateId,
        kind: 'image',
        label: input.label,
        selected: true,
        fileUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4KAAAAAASUVORK5CYII=',
        workspacePath: `/workspace/story-studio/${current.id}/asset-bible/${input.candidateId}.png`,
        originalName: message.file?.name ?? `${input.candidateId}.png`,
        mimeType: message.file?.type ?? 'image/png',
        size: message.file?.size ?? 68,
        prompt: input.prompt ?? null,
        providerReceipt: {
          provider: 'manual_upload',
          taskId: input.operationId,
          model: null,
          status: 'completed'
        }
      })
      current.revision += 1
      current.counts.candidates += 1
      production.counts.candidates += 1
      production.counts.selectedCandidates += 1
      state.actions.push({
        actionKey: message.actionKey,
        projectId: current.id,
        assetId: asset.id,
        candidateId: input.candidateId,
        revision: current.revision
      })
      return {
        result: {
          success: true,
          refresh: true,
          data: {
            projectId: current.id,
            revision: current.revision
          }
        }
      }
    }

    if (message.type === 'requestData') {
      state.requestDataCount += 1
      const query = message.query ?? {}
      const parameters = query.parameters ?? {}
      const search =
        typeof query.search === 'string'
          ? query.search.trim().toLocaleLowerCase()
          : ''
      const status =
        typeof parameters.status === 'string'
          ? parameters.status
          : null
      const filtered = state.projects.filter(
        (item) =>
          (!status || item.status === status) &&
          (!search ||
            item.title.toLocaleLowerCase().includes(search) ||
            item.premise.toLocaleLowerCase().includes(search))
      )
      const page =
        Number.isInteger(query.page) && query.page > 0 ? query.page : 1
      const pageSize =
        Number.isInteger(query.pageSize) && query.pageSize > 0
          ? Math.min(query.pageSize, 50)
          : 20
      const pageItems = filtered.slice(
        (page - 1) * pageSize,
        page * pageSize
      )
      const requestedId =
        typeof parameters.projectId === 'string'
          ? parameters.projectId
          : null
      const detail =
        state.projects.find((item) => item.id === requestedId) ??
        pageItems[0] ??
        null
      return {
        data: workbenchData(
          pageItems,
          detail,
          filtered.length,
          page,
          pageSize,
          state
        )
      }
    }

    if (message.type === 'executeAction') {
      if (state.failNextAction) {
        state.failNextAction = false
        return {
          result: {
            success: false,
            message: {
              en_US: 'Preview action rejected',
              zh_Hans: '预览动作已拒绝'
            }
          }
        }
      }
      if (message.actionKey === 'create_project') {
        const input = message.input ?? {}
        const created = project({
          id: `project-${state.projects.length + 1}`,
          title: input.title,
          description: input.description,
          premise: input.premise,
          productionFormat: input.productionFormat,
          aspectRatio: input.aspectRatio,
          targetDurationSeconds: input.targetDurationSeconds,
          status: 'draft',
          revision: 1,
          tags: input.tags
        })
        state.projects.unshift(created)
        state.actions.push({
          actionKey: message.actionKey,
          projectId: created.id,
          revision: created.revision
        })
        return {
          result: {
            success: true,
            data: mutationResult(created, input.operationId, false)
          }
        }
      }

      if (message.actionKey === 'update_project_status') {
        const input = message.input ?? {}
        const current = state.projects.find(
          (item) => item.id === input.projectId
        )
        if (!current) {
          throw new Error('Preview project was not found.')
        }
        if (current.revision !== input.baseRevision) {
          throw new Error('Preview revision conflict.')
        }
        const previousRevision = current.revision
        current.status = input.status
        current.revision += 1
        current.updatedAt = '2026-07-25T12:00:00.000Z'
        current.nextAction = nextAction(current.status)
        state.actions.push({
          actionKey: message.actionKey,
          projectId: current.id,
          previousRevision,
          revision: current.revision,
          status: current.status
        })
        return {
          result: {
            success: true,
            data: mutationResult(
              current,
              input.operationId,
              false,
              previousRevision
            )
          }
        }
      }
      if (message.actionKey === 'update_project') {
        const input = message.input ?? {}
        const current = state.projects.find(
          (item) => item.id === input.projectId
        )
        if (!current) throw new Error('Preview project was not found.')
        if (current.revision !== input.baseRevision) {
          return revisionConflict(current.revision)
        }
        const previousRevision = current.revision
        const changedFields = []
        for (const key of [
          'title',
          'description',
          'premise',
          'productionFormat',
          'aspectRatio',
          'targetDurationSeconds',
          'tags'
        ]) {
          if (Object.hasOwn(input, key)) {
            current[key] = structuredClone(input[key])
            changedFields.push(key)
          }
        }
        current.revision += 1
        current.updatedAt = '2026-07-25T12:01:00.000Z'
        state.actions.push({
          actionKey: message.actionKey,
          projectId: current.id,
          previousRevision,
          revision: current.revision,
          changedFields
        })
        return {
          result: {
            success: true,
            data: mutationResult(
              current,
              input.operationId,
              false,
              previousRevision,
              changedFields
            )
          }
        }
      }
      if (message.actionKey === 'save_production') {
        const input = message.input ?? {}
        const current = state.projects.find(
          (item) => item.id === input.projectId
        )
        if (!current) throw new Error('Preview project was not found.')
        if (current.revision !== input.baseRevision) {
          return revisionConflict(current.revision)
        }
        const previousRevision = current.revision
        const previous = state.productionByProject[input.projectId]
        const counts = productionCounts(input.production)
        const production = {
          ...structuredClone(input.production),
          id:
            previous?.id ??
            '00000000-0000-4000-8000-000000000088',
          projectId: input.projectId,
          projectRevision: previousRevision + 1,
          documentRevision: (previous?.documentRevision ?? 0) + 1,
          counts,
          totalDurationSeconds: productionDuration(input.production),
          updatedAt: '2026-07-25T12:02:00.000Z'
        }
        state.productionByProject[input.projectId] = production
        current.revision += 1
        current.updatedAt = production.updatedAt
        current.counts = {
          sources: counts.sources,
          events: counts.beats,
          episodes: counts.episodes,
          assets: counts.assets,
          shots: counts.shots,
          candidates: counts.candidates
        }
        state.actions.push({
          actionKey: message.actionKey,
          projectId: current.id,
          previousRevision,
          revision: current.revision,
          documentRevision: production.documentRevision,
          changedFields: ['production']
        })
        return {
          result: {
            success: true,
            data: {
              projectId: current.id,
              revision: current.revision,
              documentRevision: production.documentRevision
            }
          }
        }
      }
      if (message.actionKey === 'prepare_cut_handoff') {
        const input = message.input ?? {}
        const current = state.projects.find(
          (item) => item.id === input.projectId
        )
        if (!current) {
          throw new Error('Preview project was not found.')
        }
        if (current.revision !== input.expectedRevision) {
          throw new Error('Preview revision conflict.')
        }
        const previous = state.handoffByProject[input.projectId]
        const handoff = {
          id: '00000000-0000-4000-8000-000000000077',
          projectId: input.projectId,
          contractVersion: '1.0',
          sourceRevision: current.revision,
          handoffRevision: 1,
          mode: previous?.cutProjectId ? 'proposal' : 'create',
          status: 'ready',
          checksum:
            'd49922a7221f8ffaf315eed4cb92f305f5fe6fb82744bde9a3a7f4e70a3c2012',
          cutProjectId: previous?.cutProjectId ?? null,
          cutProjectRevision: previous?.cutProjectRevision ?? null,
          cutProposalId: null,
          shotCount: 2,
          durationSeconds: 10,
          width: 720,
          height: 1280,
          fps: input.fps ?? 24,
          changeSummary: input.changeSummary,
          failureCode: null,
          failureMessage: null
        }
        state.handoffByProject[input.projectId] = handoff
        state.actions.push({
          actionKey: message.actionKey,
          projectId: input.projectId,
          handoffId: handoff.id,
          mode: handoff.mode
        })
        return {
          result: {
            success: true,
            data: {
              success: true,
              duplicate: false,
              handoff
            }
          }
        }
      }
      throw new Error(
        `Unsupported Story Studio action '${message.actionKey}'.`
      )
    }

    if (
      message.type === 'invokeClientCommand' &&
      message.commandKey === 'assistant.context.set'
    ) {
      state.assistantContext = structuredClone(message.payload)
      return { result: { success: true } }
    }

    if (
      message.type === 'invokeClientCommand' &&
      message.commandKey === 'assistant.chat.send_message'
    ) {
      state.assistantMessages.push(structuredClone(message.payload))
      const commandState = message.payload?.state ?? {}
      if (commandState.action === 'accept_story_cut_handoff') {
        const handoff = state.handoffByProject[commandState.projectId]
        if (handoff) {
          handoff.status =
            handoff.mode === 'proposal' ? 'proposal_ready' : 'delivered'
          handoff.handoffRevision += 1
          handoff.cutProjectId =
            handoff.cutProjectId ??
            '00000000-0000-4000-8000-000000000055'
          handoff.cutProjectRevision = 1
          handoff.cutProposalId =
            handoff.mode === 'proposal'
              ? '00000000-0000-4000-8000-000000000044'
              : null
        }
      }
      return { result: { success: true } }
    }

    throw new Error(
      `Unsupported Story Studio preview request '${message.type}'.`
    )
  },
  async handleEvent(message, { state }) {
    if (message.type === 'notify') {
      state.notifications.push({
        level: message.level,
        message: message.message
      })
    }
    return {}
  }
}

function project(input) {
  return {
    id: input.id,
    title: input.title,
    description: input.description || null,
    premise: input.premise || null,
    productionFormat: input.productionFormat || 'vertical_short',
    aspectRatio: input.aspectRatio || '9:16',
    targetDurationSeconds: input.targetDurationSeconds ?? null,
    status: input.status || 'draft',
    revision: input.revision || 1,
    tags: Array.isArray(input.tags) ? input.tags : [],
    failureCode: null,
    failureMessage: null,
    failureRecoverable: null,
    createdAt: '2026-07-25T08:00:00.000Z',
    updatedAt: '2026-07-25T08:00:00.000Z',
    counts: {
      sources: 0,
      events: 0,
      episodes: 0,
      assets: 0,
      shots: 0,
      candidates: 0
    },
    availableReads: [
      'story_get_project_summary',
      'story_search_projects'
    ],
    nextAction: nextAction(input.status || 'draft')
  }
}

function workbenchData(items, detail, total, page, pageSize, state) {
  return {
    tableKey: 'projects',
    table: {
      key: 'projects',
      items,
      total,
      page,
      pageSize
    },
    projects: {
      items,
      total,
      page,
      pageSize,
      search: ''
    },
    detail,
    production: detail ? state.productionByProject[detail.id] ?? null : null,
    handoff: detail ? state.handoffByProject[detail.id] ?? null : null
  }
}

function productionFixture() {
  return {
    id: '00000000-0000-4000-8000-000000000088',
    projectId: 'project-1',
    projectRevision: 1,
    documentRevision: 1,
    sourceSynopsis: '月港信使送出一段不愿被遗忘的记忆。',
    adaptationGoal: '在十秒内完成发现、选择与离开的情绪转折。',
    visualStyle: '月光蓝与琥珀色记忆颗粒',
    audience: '奇幻短剧观众',
    sourceMaterials: [
      {
        id: 'source-moon-port',
        title: '潮汐旧闻',
        type: 'text',
        excerpt: '月港每次涨潮都会冲走一段记忆，信使负责在黎明前将它们送回。',
        status: 'reviewed'
      }
    ],
    storyPlan: {
      logline: '信使必须在城市沉没前，把最后一段记忆送回已消失的主人。',
      theme: '被遗忘的人仍值得被送回家。',
      tone: '静谧、奇幻、带着离别后的希望',
      beats: [
        {
          id: 'beat-discovery',
          title: '发现',
          summary: '最后一件包裹投射出失踪者的轮廓。',
          purpose: '建立悬念与情感对象。'
        },
        {
          id: 'beat-choice',
          title: '选择',
          summary: '信使越过即将封闭的潮线。',
          purpose: '用行动完成情绪转折。'
        }
      ]
    },
    episodes: [
      {
        id: 'episode-1',
        order: 1,
        title: '最后一件包裹',
        summary: '信使在涨潮前完成不可能的递送。',
        script: '内景，月港驿站。包裹亮起。信使抬头望向潮线。\n信使：请把我送回家。',
        targetDurationSeconds: 10
      }
    ],
    assets: [
      {
        id: 'asset-courier',
        kind: 'character',
        name: '月港信使',
        description: '穿深蓝防水斗篷，携带琥珀色记忆匣。',
        prompt: '月光蓝奇幻电影感，深蓝斗篷，琥珀色记忆颗粒',
        candidates: []
      },
      {
        id: 'asset-package',
        kind: 'prop',
        name: '记忆包裹',
        description: '会投射失踪者轮廓的琥珀色匣子。',
        prompt: '发光琥珀匣，潮湿石桌，电影级近景',
        candidates: []
      }
    ],
    characters: [{ id: 'courier', name: '信使' }],
    scenes: [
      {
        id: 'moon-port',
        order: 1,
        title: '月港',
        summary: '信使在涨潮前收到最后一件包裹。',
        shots: [
          {
            id: 'package',
            title: '记忆包裹',
            composition: '发光包裹位于画面中心。',
            action: '包裹投射出失踪者的轮廓。',
            camera: '缓慢推进',
            dialogue: '请把我送回家。',
            durationSeconds: 5,
            candidates: [
              {
                id: 'candidate-package',
                kind: 'image',
                label: '记忆包裹主画面',
                selected: false,
                fileUrl: shotImages.package,
                workspacePath: '/workspace/story-studio/project-1/package.png',
                prompt: '发光包裹投射失踪者轮廓，月光蓝与琥珀色'
              },
              {
                id: 'candidate-package-video',
                kind: 'video',
                label: '记忆包裹 Seedance 成片',
                selected: true,
                fileUrl: 'data:video/mp4;base64,AAAA',
                workspacePath: '/workspace/story-studio/project-1/package.mp4',
                originalName: 'package.mp4',
                mimeType: 'video/mp4',
                size: 1048576,
                sha256:
                  'e49922a7221f8ffaf315eed4cb92f305f5fe6fb82744bde9a3a7f4e70a3c2013',
                prompt: '发光包裹投射失踪者轮廓，月光蓝与琥珀色',
                providerReceipt: {
                  provider: 'seedream_aigc',
                  taskId: 'seedance-package',
                  model: 'doubao-seedance-2-0-fast-260128',
                  status: 'succeeded'
                }
              }
            ]
          },
          {
            id: 'departure',
            title: '越过潮线',
            composition: '信使背对镜头走向月光。',
            action: '城市灯火随潮水逐盏熄灭。',
            camera: '固定远景',
            durationSeconds: 5,
            candidates: [
              {
                id: 'candidate-departure',
                kind: 'image',
                label: '越过潮线主画面',
                selected: false,
                fileUrl: shotImages.departure,
                workspacePath: '/workspace/story-studio/project-1/departure.png',
                prompt: '信使背影走向月光潮线，城市灯火熄灭'
              },
              {
                id: 'candidate-departure-video',
                kind: 'video',
                label: '越过潮线 Seedance 成片',
                selected: true,
                fileUrl: 'data:video/mp4;base64,AAAA',
                workspacePath:
                  '/workspace/story-studio/project-1/departure.mp4',
                originalName: 'departure.mp4',
                mimeType: 'video/mp4',
                size: 1180000,
                sha256:
                  'f49922a7221f8ffaf315eed4cb92f305f5fe6fb82744bde9a3a7f4e70a3c2014',
                prompt: '信使背影走向月光潮线，城市灯火熄灭',
                providerReceipt: {
                  provider: 'seedream_aigc',
                  taskId: 'seedance-departure',
                  model: 'doubao-seedance-2-0-fast-260128',
                  status: 'succeeded'
                }
              }
            ]
          }
        ]
      }
    ],
    counts: {
      sources: 1,
      beats: 2,
      episodes: 1,
      assets: 2,
      characters: 1,
      scenes: 1,
      shots: 2,
      candidates: 4,
      selectedCandidates: 2
    },
    totalDurationSeconds: 10,
    updatedAt: '2026-07-25T11:00:00.000Z'
  }
}

function mutationResult(
  item,
  operationId,
  duplicate,
  previousRevision = null,
  changedFields = null
) {
  return {
    project: structuredClone(item),
    receipt: {
      success: true,
      duplicate,
      operationId,
      projectId: item.id,
      previousRevision,
      revision: item.revision,
      status: item.status,
      changedFields:
        changedFields ??
        (previousRevision === null ? ['title', 'status'] : ['status']),
      nextAction: item.nextAction
    }
  }
}

function revisionConflict(currentRevision) {
  return {
    result: {
      success: false,
      message: {
        en_US: 'The project changed remotely.',
        zh_Hans: '项目已被 Agent 更新，请先合并或重新加载。'
      },
      data: {
        errorCode: 'story_revision_conflict',
        currentRevision
      }
    }
  }
}

function productionCounts(production) {
  const scenes = Array.isArray(production?.scenes)
    ? production.scenes
    : []
  const shots = scenes.flatMap((scene) =>
    Array.isArray(scene.shots) ? scene.shots : []
  )
  const assets = Array.isArray(production?.assets)
    ? production.assets
    : []
  const candidates = [
    ...assets.flatMap((asset) =>
      Array.isArray(asset.candidates) ? asset.candidates : []
    ),
    ...shots.flatMap((shot) =>
      Array.isArray(shot.candidates) ? shot.candidates : []
    )
  ]
  return {
    sources: Array.isArray(production?.sourceMaterials)
      ? production.sourceMaterials.length
      : 0,
    beats: Array.isArray(production?.storyPlan?.beats)
      ? production.storyPlan.beats.length
      : 0,
    episodes: Array.isArray(production?.episodes)
      ? production.episodes.length
      : 0,
    assets: assets.length,
    characters: Array.isArray(production?.characters)
      ? production.characters.length
      : 0,
    scenes: scenes.length,
    shots: shots.length,
    candidates: candidates.length,
    selectedCandidates: candidates.filter(
      (candidate) => candidate.selected === true
    ).length
  }
}

function productionDuration(production) {
  return (production?.scenes ?? []).reduce(
    (total, scene) =>
      total +
      (scene.shots ?? []).reduce(
        (sceneTotal, shot) =>
          sceneTotal + (Number(shot.durationSeconds) || 0),
        0
      ),
    0
  )
}

function nextAction(status) {
  if (status === 'draft') {
    return 'Review the brief and move the project to planning.'
  }
  if (status === 'planning') {
    return 'Import source material and build a reviewed adaptation plan.'
  }
  return 'Review the current project stage.'
}
