import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const platformRoot = resolve(componentRoot, '../../../../../../../../xpert')
const tinyPreviewImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4KAAAAAASUVORK5CYII='
const uploadedPreviewImage = `data:image/png;base64,${readFileSync(
  resolve(componentRoot, 'src/assets/lin-wan-portrait.png')
).toString('base64')}`

const projects = [
  project({
    id: 'project-1',
    title: '逆光重逢',
    premise: '纪录片摄影师在雨夜旧影棚重逢失联搭档，重新面对一段未完成的影片。',
    productionFormat: 'vertical_short',
    aspectRatio: '9:16',
    targetDurationSeconds: 96,
    status: 'production',
    revision: 3,
    tags: ['都市情感', '悬疑', '短剧']
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
    videoTasksByProject: {},
    selectedVideoGeneratorByProject: {
      'project-1': 'preview-video-generator'
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
      message.actionKey === 'upload_voice_reference_audio'
    ) {
      const input = message.input ?? {}
      const current = state.projects.find((item) => item.id === input.projectId)
      const production = state.productionByProject[input.projectId]
      const asset = production?.assets.find((item) => item.id === input.assetId)
      if (!current || !production || asset?.kind !== 'character') {
        throw new Error('Preview character asset was not found.')
      }
      const voiceReference = {
        url: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        label: input.label,
        workspacePath: `/workspace/story-studio/${current.id}/voice-references/${input.referenceId}.wav`,
        originalName: message.file?.name ?? `${input.referenceId}.wav`,
        mimeType: message.file?.type ?? 'audio/wav',
        size: message.file?.size ?? 44
      }
      state.actions.push({
        actionKey: message.actionKey,
        projectId: current.id,
        assetId: asset.id,
        referenceId: input.referenceId
      })
      return {
        result: {
          success: true,
          refresh: false,
          data: { projectId: current.id, voiceReference }
        }
      }
    }

    if (
      message.type === 'executeFileAction' &&
      (message.actionKey === 'upload_asset_image' ||
        message.actionKey === 'upload_shot_reference_image')
    ) {
      const input = message.input ?? {}
      const current = state.projects.find(
        (item) => item.id === input.projectId
      )
      const production = state.productionByProject[input.projectId]
      if (message.actionKey === 'upload_shot_reference_image') {
        const shot = production?.scenes
          .find((item) => item.id === input.sceneId)?.shots
          .find((item) => item.id === input.shotId)
        if (!current || !production || !shot) {
          throw new Error('Preview shot was not found.')
        }
        if (current.revision !== input.baseRevision) {
          return revisionConflict(current.revision)
        }
        shot.candidates = shot.candidates.map((candidate) => ({
          ...candidate,
          selected: candidate.kind === 'image' ? false : candidate.selected
        }))
        shot.candidates.push({
          id: input.candidateId,
          kind: 'image',
          label: input.label,
          selected: true,
          fileUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4KAAAAAASUVORK5CYII=',
          workspacePath: `/workspace/story-studio/${current.id}/shot-references/${input.candidateId}.png`,
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
        state.actions.push({
          actionKey: message.actionKey,
          projectId: current.id,
          shotId: shot.id,
          candidateId: input.candidateId,
          revision: current.revision
        })
        return {
          result: {
            success: true,
            refresh: true,
            data: { projectId: current.id, revision: current.revision }
          }
        }
      }
      const asset = production?.assets.find(
        (item) => item.id === input.assetId
      )
      if (!current || !production || !asset) {
        throw new Error('Preview asset was not found.')
      }
      if (current.revision !== input.baseRevision) {
        return revisionConflict(current.revision)
      }
      const sameReference = (left, right) => {
        if (!left || !right || left.type !== right.type) return false
        return left.type === 'general' || left.key === right.key
      }
      const previousCandidateCount = asset.candidates.length
      const sourceCandidates = input.replaceReference && input.assetReference
        ? asset.candidates.filter((candidate) =>
            !sameReference(candidate.assetReference, input.assetReference)
          )
        : asset.candidates
      asset.candidates = sourceCandidates.map((candidate) => ({
        ...candidate,
        selected:
          input.select !== false && candidate.kind === 'image'
            ? false
            : candidate.selected
      }))
      asset.candidates.push({
        id: input.candidateId,
        kind: 'image',
        label: input.label,
        selected: input.select !== false,
        fileUrl: uploadedPreviewImage,
        workspacePath: `/workspace/story-studio/${current.id}/asset-bible/${input.candidateId}.png`,
        originalName: message.file?.name ?? `${input.candidateId}.png`,
        mimeType: message.file?.type ?? 'image/png',
        size: message.file?.size ?? 68,
        prompt: input.prompt ?? null,
        assetReference: input.assetReference ?? { type: 'general' },
        providerReceipt: {
          provider: 'manual_upload',
          taskId: input.operationId,
          model: null,
          status: 'completed'
        }
      })
      current.revision += 1
      const candidateDelta = asset.candidates.length - previousCandidateCount
      current.counts.candidates += candidateDelta
      production.counts.candidates += candidateDelta
      if (input.select !== false) production.counts.selectedCandidates += 1
      state.actions.push({
        actionKey: message.actionKey,
        projectId: current.id,
        assetId: asset.id,
        candidateId: input.candidateId,
        assetReference: input.assetReference,
        replaceReference: input.replaceReference === true,
        select: input.select !== false,
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
      if (message.actionKey === 'list_shot_video_tasks') {
        const input = message.input ?? {}
        const items = state.videoTasksByProject[input.projectId] ?? []
        state.actions.push({
          actionKey: message.actionKey,
          projectId: input.projectId
        })
        return {
          result: {
            success: true,
            data: { items, total: items.length, page: 1, pageSize: 50 }
          }
        }
      }
      if (message.actionKey === 'set_project_video_generator') {
        const input = message.input ?? {}
        state.selectedVideoGeneratorByProject[input.projectId] = input.toolsetId
        state.actions.push({
          actionKey: message.actionKey,
          projectId: input.projectId,
          toolsetId: input.toolsetId
        })
        return { result: { success: true, data: { projectId: input.projectId } } }
      }
      if (message.actionKey === 'generate_shot_takes') {
        const input = message.input ?? {}
        const production = state.productionByProject[input.projectId]
        const shot = production?.scenes
          .find((item) => item.id === input.sceneId)?.shots
          .find((item) => item.id === input.shotId)
        if (!shot) throw new Error('Preview shot was not found.')
        const videoCandidates = shot.candidates.filter((item) => item.kind === 'video')
        const tasks = Array.from({ length: input.takeCount }, (_, index) => ({
          id: `preview-video-task-${Date.now()}-${index + 1}`,
          projectId: input.projectId,
          sceneId: input.sceneId,
          shotId: input.shotId,
          requestGroupId: input.operationId,
          takeIndex: index + 1,
          generatorFamily: 'veo',
          generatorName: 'Veo',
          status: 'completed',
          stage: 'completed',
          progress: 100,
          resultCandidateId: videoCandidates[index]?.id ?? null,
          failureCode: null,
          failureMessage: null,
          recoverable: false,
          upstreamMayContinue: false,
          createdAt: '2026-08-06T10:00:00.000Z',
          updatedAt: '2026-08-06T10:01:00.000Z'
        }))
        state.videoTasksByProject[input.projectId] = tasks
        state.actions.push({
          actionKey: message.actionKey,
          projectId: input.projectId,
          takeCount: input.takeCount,
          referenceAssetIds: input.referenceAssetIds,
          referenceImageCandidateIds: input.referenceImageCandidateIds,
          operationId: input.operationId
        })
        return { result: { success: true, data: { tasks } } }
      }
      if (message.actionKey === 'select_shot_video') {
        const input = message.input ?? {}
        const current = state.projects.find((item) => item.id === input.projectId)
        const production = state.productionByProject[input.projectId]
        const shot = production?.scenes
          .find((item) => item.id === input.sceneId)?.shots
          .find((item) => item.id === input.shotId)
        if (!current || !shot) throw new Error('Preview shot was not found.')
        for (const candidate of shot.candidates) {
          if (candidate.kind === 'video') candidate.selected = candidate.id === input.candidateId
        }
        current.revision += 1
        production.projectRevision = current.revision
        state.actions.push({
          actionKey: message.actionKey,
          projectId: input.projectId,
          candidateId: input.candidateId,
          revision: current.revision
        })
        return { result: { success: true, data: { projectId: input.projectId } } }
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
          shotCount: 13,
          durationSeconds: 96,
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
      'story_get_project_revision',
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
    handoff: detail ? state.handoffByProject[detail.id] ?? null : null,
    videoGenerators: detail ? videoGeneratorCatalog(detail.id, state) : null,
    videoTasks: detail
      ? {
          items: state.videoTasksByProject[detail.id] ?? [],
          total: (state.videoTasksByProject[detail.id] ?? []).length,
          page: 1,
          pageSize: 50
        }
      : null
  }
}

function videoGeneratorCatalog(projectId, state) {
  return {
    selectedToolsetId:
      state.selectedVideoGeneratorByProject[projectId] ??
      'preview-video-generator',
    generators: [
      {
        id: 'preview-video-generator',
        family: 'veo',
        displayName: 'Veo',
        available: true,
        unavailableReason: null,
        models: [{ id: 'veo-3.1', label: 'Veo 3.1' }],
        defaultModel: 'veo-3.1',
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16'],
        durationSeconds: { min: 2, max: 30, default: 6 },
        supportsAudio: true,
        supportsCancel: false
      },
      ...['seedance', 'kling'].map((family) => ({
        id: `unavailable:${family}`,
        family,
        displayName: family === 'seedance' ? 'Seedance' : 'Kling',
        available: false,
        unavailableReason: 'workspace_not_configured',
        models: [],
        defaultModel: '',
        resolutions: [],
        aspectRatios: [],
        durationSeconds: { min: 0, max: 0, default: 0 },
        supportsAudio: false,
        supportsCancel: false
      }))
    ]
  }
}

function productionFixture() {
  const shotDefinitions = [
    ['S11', '影棚外全景', '雨夜旧影棚外景，远处灯光穿过雨幕。', '缓慢推近', 8],
    ['S12', '雨夜旧影棚重逢', '林晚与顾沉隔雨相望。', '中景双人，轻微推近', 7],
    ['S13', '两人对峙', '顾沉上前一步，林晚握紧相机。', '近景双人', 6],
    ['S14', '转身离开', '林晚压下情绪，转身走向影棚。', '侧后跟拍', 6],
    ['S21', '空镜 · 摄影棚内部', '积灰灯架与旧布景形成纵深。', '固定全景', 6],
    ['S22', '女主演准备', '林晚擦去旧相机上的雨水。', '中近景', 7],
    ['S23', '男主演沉思', '顾沉望向封存的胶片柜。', '近景缓推', 6],
    ['S24', '对话开始', '两人围绕未完成的纪录片试探。', '双人过肩', 10],
    ['S25', '监视眼神写', '顾沉发现窗外一闪而过的人影。', '特写快速推近', 5],
    ['S31', '化妆间全景', '旧镜前灯泡逐个亮起。', '固定全景', 6],
    ['S32', '女主演独白', '林晚对着镜子承认自己从未忘记。', '镜面中近景', 9],
    ['S33', '回忆插入', '多年前两人在片场并肩工作的片段。', '手持回忆镜头', 8],
    ['S34', '情绪低落', '林晚低下头，雨水从风衣袖口滴落。', '特写缓推', 6]
  ]
  const makeShot = (definition, index) => ({
    id: `shot-${definition[0].toLowerCase()}`,
    title: definition[1],
    composition: definition[2],
    action: definition[2],
    camera: definition[3],
    dialogue: index === 1 ? '你还是来了。' : index === 2 ? '我只是来拿回属于我的东西。' : null,
    dialogueSpeakerId: index === 1 ? 'asset-linwan' : index === 2 ? 'asset-guchen' : null,
    dialogueType: index === 1 || index === 2 ? 'dialogue' : null,
    soundEffects: ['雨声', '远处雷声'],
    generationPrompt: `${definition[2]}，${definition[3]}，冷蓝雨夜与暖色逆光，角色身份一致。`,
    emotion: index < 4 ? '克制、试探、隐忍' : '紧张、悬疑',
    lens: index % 3 === 0 ? '24mm' : index % 3 === 1 ? '35mm' : '50mm',
    lighting: '雨夜顶光 + 暖色侧逆光',
    colorTone: '冷暖对比 / 低饱和',
    weather: '雨夜',
    videoSettings: index === 1
      ? {
          generatorId: 'preview-video-generator',
          model: 'veo-3.1',
          resolution: '720p',
          aspectRatio: '9:16',
          fps: 24,
          takeCount: 1,
          referenceAssetIds: ['asset-linwan', 'asset-studio-exterior']
        }
      : index === 2
        ? {
            generatorId: 'preview-video-generator',
            model: 'veo-3.1',
            resolution: '1080p',
            aspectRatio: '16:9',
            fps: 30,
            takeCount: 2,
            referenceAssetIds: ['asset-linwan', 'asset-guchen']
          }
        : undefined,
    durationSeconds: definition[4],
    candidates: [
      {
        id: `candidate-${definition[0].toLowerCase()}-image`,
        kind: 'image',
        label: `${definition[1]}主画面`,
        selected: true,
        fileUrl: tinyPreviewImage,
        workspacePath: `/workspace/story-studio/project-1/${definition[0].toLowerCase()}.png`,
        prompt: `${definition[2]}，电影级雨夜写实，角色身份一致。`
      },
      {
        id: `candidate-${definition[0].toLowerCase()}-video`,
        kind: 'video',
        label: `${definition[1]} Seedance 成片`,
        selected: index !== 1,
        fileUrl: `/__story-studio-preview/${definition[0].toLowerCase()}.mp4`,
        workspacePath: `/workspace/story-studio/project-1/${definition[0].toLowerCase()}.mp4`,
        originalName: `${definition[0].toLowerCase()}.mp4`,
        mimeType: 'video/mp4',
        size: 1048576 + index * 1024,
        sha256: (index + 1).toString(16).padStart(64, '0'),
        prompt: `${definition[2]}，角色一致性严格，雨声与对白同步。`,
        providerReceipt: {
          provider: 'seedream_aigc',
          taskId: `seedance-${definition[0].toLowerCase()}`,
          model: 'doubao-seedance-2-0-fast-260128',
          status: 'succeeded'
        }
      },
      ...(index === 2
        ? Array.from({ length: 3 }, (_, takeIndex) => ({
            id: `candidate-${definition[0].toLowerCase()}-video-take-${takeIndex + 2}`,
            kind: 'video',
            label: `${definition[1]} Take ${takeIndex + 2}`,
            selected: false,
            fileUrl: `/__story-studio-preview/${definition[0].toLowerCase()}-take-${takeIndex + 2}.mp4`,
            workspacePath: `/workspace/story-studio/project-1/${definition[0].toLowerCase()}-take-${takeIndex + 2}.mp4`,
            originalName: `${definition[0].toLowerCase()}-take-${takeIndex + 2}.mp4`,
            mimeType: 'video/mp4',
            size: 1048576 + (takeIndex + 2) * 1024,
            sha256: (takeIndex + 20).toString(16).padStart(64, '0'),
            prompt: `${definition[2]}，Take ${takeIndex + 2}，改变情感距离和轻微机位。`,
            providerReceipt: {
              provider: 'seedream_aigc',
              taskId: `seedance-${definition[0].toLowerCase()}-take-${takeIndex + 2}`,
              model: 'doubao-seedance-2-0-fast-260128',
              status: 'succeeded'
            }
          }))
        : [])
    ]
  })
  const allShots = shotDefinitions.map(makeShot)
  const scenes = [
    {
      id: 'scene-rainy-exterior',
      episodeId: 'episode-1',
      order: 1,
      title: '雨夜 · 旧影棚外',
      summary: '林晚与顾沉在废弃摄影棚外久别重逢。',
      location: '旧影棚外',
      timeOfDay: '雨夜',
      shots: allShots.slice(0, 4)
    },
    {
      id: 'scene-studio-interior',
      episodeId: 'episode-1',
      order: 2,
      title: '影棚内 · 摄影棚',
      summary: '两人在未完成的纪录片现场继续试探。',
      location: '摄影棚内部',
      timeOfDay: '夜',
      shots: allShots.slice(4, 9)
    },
    {
      id: 'scene-dressing-room',
      episodeId: 'episode-1',
      order: 3,
      title: '化妆间',
      summary: '林晚独处时，记忆和现实交叠。',
      location: '旧化妆间',
      timeOfDay: '夜',
      shots: allShots.slice(9)
    }
  ]
  const assetImage = {
    id: 'asset-linwan-image-v3',
    kind: 'image',
    label: '林晚 V3 身份包',
    selected: true,
    fileUrl: tinyPreviewImage,
    workspacePath: '/workspace/story-studio/project-1/lin-wan-v3.png',
    prompt: '林晚身份参考，肩长黑发，米色风衣，清冷轮廓。'
  }
  return {
    id: '00000000-0000-4000-8000-000000000088',
    projectId: 'project-1',
    projectRevision: 3,
    documentRevision: 3,
    sourceSynopsis: '雨夜，纪录片摄影师林晚在废弃旧影棚与失联多年的搭档顾沉重逢，两人被迫面对一段未完成的影片与被刻意掩埋的事故。',
    adaptationGoal: '用 96 秒竖屏短剧完成久别重逢、克制试探与悬念再起，并严格保持人物、雨夜旧影棚和旧相机的一致性。',
    visualStyle: '电影级都市情感悬疑，冷蓝雨夜与暖色旧灯对冲，低饱和、真实湿润质感、克制表演。',
    audience: '偏好都市情感、悬疑和强人物关系的竖屏短剧观众。',
    sourceMaterials: [
      {
        id: 'source-backlight-reunion',
        title: '原创梗概：逆光重逢',
        type: 'text',
        excerpt: '林晚抱着旧相机回到第七摄影棚，顾沉从雨幕中出现。两人围绕未完成的纪录片试探彼此。',
        status: 'reviewed'
      }
    ],
    storyPlan: {
      logline: '一名纪录片摄影师在废弃片场重逢失联搭档，必须决定是否重新打开一段被掩埋的真相。',
      theme: '有些真相只有重新面对彼此才能被看见。',
      tone: '克制、试探、隐忍，雨夜悬疑感。',
      beats: [
        { id: 'beat-reunion', title: '旧地重逢', summary: '雨夜旧影棚外，两人再次相见。', purpose: '建立关系张力。' },
        { id: 'beat-testing', title: '试探交锋', summary: '未完成影片成为彼此试探的引线。', purpose: '推动秘密浮现。' },
        { id: 'beat-unresolved', title: '未解心结', summary: '窗外监视者让旧事故重新逼近。', purpose: '留下下一集钩子。' }
      ],
      adaptationSuggestions: [
        {
          id: 'suggestion-rain-grip',
          episodeId: 'episode-1',
          sceneId: 'scene-rainy-exterior',
          shotId: 'shot-s13',
          originalText: '顾沉上前一步，林晚握紧相机。',
          suggestedText: '顾沉上前一步又停住。林晚的手指沿着湿透的相机背带收紧，却没有后退。',
          reason: '把“克制试探”落到可视动作，同时保留人物关系的暧昧张力。',
          status: 'pending',
          createdBy: 'assistant',
          createdAt: '2026-08-06T08:00:00.000Z'
        }
      ]
    },
    episodes: [
      {
        id: 'episode-1',
        order: 1,
        title: '雨夜重逢',
        summary: '林晚和顾沉在第七摄影棚重逢，未完成的纪录片重新把他们绑在一起。',
        script: '外景·雨夜·旧影棚外\n雨幕笼住废弃摄影棚。林晚抱着旧相机停在门口，顾沉从暗处走来。\n林晚：你还是来了。\n顾沉：我只是来拿回属于我的东西。\n两人隔着雨帘对视。远处闪电照亮褪色的“第七摄影棚”招牌。',
        targetDurationSeconds: 96
      }
    ],
    assets: [
      { id: 'asset-linwan', kind: 'character', name: '林晚', description: '独立纪录片摄影师，外冷内韧，肩长黑发，米色风衣。', prompt: '林晚角色身份包，严格一致性，肩长黑发、右眼下浅痣、米色风衣。', role: '女主 / 纪录片摄影师', visualDescription: '肩长黑发、米色风衣、右眼下浅痣。', voiceReference: { url: 'https://example.invalid/lin-wan.wav', label: '清透女声 · 克制' }, candidates: [assetImage] },
      { id: 'asset-guchen', kind: 'character', name: '顾沉', description: '纪录片摄影师，克制寡言，黑色皮衣。', prompt: '顾沉角色身份包，黑色湿发、黑色皮衣、冷峻克制。', role: '男主 / 纪录片摄影师', visualDescription: '黑色湿发、黑色皮衣、冷峻克制。', candidates: [] },
      { id: 'asset-zhouqi', kind: 'character', name: '周启', description: '调查记者，身份待确认。', prompt: '周启角色参考。', role: '调查记者', visualDescription: '干净利落，谨慎。', candidates: [] },
      { id: 'asset-chenfang', kind: 'character', name: '陈放', description: '旧影棚管理员。', prompt: '陈放角色参考。', role: '影棚管理员', visualDescription: '沉默寡言。', candidates: [] },
      { id: 'asset-studio-exterior', kind: 'location', name: '旧影棚外 · 雨夜', description: '第七摄影棚外，夜雨，湿地反光。', prompt: '废弃摄影棚雨夜外景，工业结构，冷暖对比。', candidates: [] },
      { id: 'asset-studio-interior', kind: 'location', name: '摄影棚内部', description: '封存布景和积灰灯架。', prompt: '旧摄影棚内部，写实电影灯光。', candidates: [] },
      { id: 'asset-dressing-room', kind: 'location', name: '旧化妆间', description: '镜前旧灯泡与斑驳墙面。', prompt: '旧化妆间，低饱和，镜面构图。', candidates: [] },
      { id: 'asset-camera', kind: 'prop', name: '旧相机', description: '林晚一直携带的旧纪录片相机。', prompt: '磨损的专业纪录片相机。', candidates: [] },
      { id: 'asset-film', kind: 'prop', name: '未完成胶片', description: '顾沉要取回的关键证据。', prompt: '旧胶片盒，证据感。', candidates: [] },
      { id: 'asset-style', kind: 'style', name: '逆光雨夜', description: '冷蓝雨夜与暖色逆光。', prompt: '低饱和冷暖对比，电影级雨夜。', candidates: [] }
    ].map(withAssetDetails),
    scenes,
    counts: {
      sources: 1,
      beats: 3,
      episodes: 1,
      assets: 10,
      characters: 4,
      scenes: 3,
      shots: 13,
      candidates: 27,
      selectedCandidates: 14
    },
    totalDurationSeconds: 96,
    updatedAt: '2026-08-05T02:24:00.000Z'
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
    characters: assets.filter((asset) => asset.kind === 'character').length,
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

function withAssetDetails(asset) {
  const common = {
    ...asset,
    negativePrompt: '多人脸融合，异常肢体，文字水印，塑料质感',
    continuityNotes: '同一集内保持形状、磨损、材质和主色不变。'
  }
  if (asset.kind === 'character') {
    return {
      ...common,
      categoryDetails: {
        identity: `${asset.name}的锁定角色身份包，不随镜头角度改变骨相。`,
        appearance: asset.name === '林晚' ? '肩长黑发 / 清冷轮廓 / 右眼下浅痣' : '黑色湿发 / 冷峻轮廓 / 窄下颌',
        wardrobe: asset.name === '林晚' ? '米色风衣 / 深灰针织衫 / 深色长裤' : '黑色皮衣 / 深色内搭',
        voice: asset.name === '林晚' ? '清透女声，克制，偏低音区' : '低沉男声，短句，少量气声',
        environment: null,
        lighting: null,
        material: null,
        condition: null,
        storyFunction: null,
        palette: null,
        lens: null,
        continuity: '雨场造型从外景到影棚内保持湿发与衣物湿度连续。'
      }
    }
  }
  if (asset.kind === 'location') {
    return {
      ...common,
      categoryDetails: {
        identity: null,
        appearance: null,
        wardrobe: null,
        voice: null,
        environment: `${asset.description}空间纵深清晰，出入口与主布景方位固定。`,
        lighting: '冷蓝环境光，暖色旧灯作局部侧逆光，湿地反光。',
        material: null,
        condition: null,
        storyFunction: null,
        palette: null,
        lens: null,
        continuity: '招牌、灯架、门窗和积水区域在连续镜头中保持位置一致。'
      }
    }
  }
  if (asset.kind === 'prop') {
    return {
      ...common,
      categoryDetails: {
        identity: null,
        appearance: null,
        wardrobe: null,
        voice: null,
        environment: null,
        lighting: null,
        material: asset.name.includes('相机') ? '黑色金属机身 / 旧皮背带' : '氧化铁盒 / 泛黄胶片',
        condition: '明显使用磨损，边角有稳定划痕，雨场表面带水珠。',
        storyFunction: asset.description,
        palette: null,
        lens: null,
        continuity: '持有人、背带方向、镜头盖状态和湿度必须衔接上一镜。'
      }
    }
  }
  return {
    ...common,
    categoryDetails: {
      identity: null,
      appearance: null,
      wardrobe: null,
      voice: null,
      environment: null,
      lighting: '冷蓝环境光 + 暖色旧灯侧逆光，中低对比。',
      material: null,
      condition: null,
      storyFunction: null,
      palette: '#18232F / #40576B / #C58B55 / #E8DDC8',
      lens: '24mm 建立空间，35mm 双人，50–85mm 情绪特写。',
      continuity: '低饱和、真实湿润质感、暗部保留细节，避免高饱和霓虹。'
    }
  }
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
