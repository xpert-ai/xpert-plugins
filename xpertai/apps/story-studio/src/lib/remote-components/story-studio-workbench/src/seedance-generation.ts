import type {
  Character,
  ProductionView,
  Scene,
  Shot
} from './production-data'
import { compactVoiceReference } from '../../../voice-reference.js'

export type SeedanceGenerationTarget = {
  sceneId: string
  shotId: string
  shotTitle: string
  durationSeconds: number
  imageWorkspacePath: string
  prompt: string
  generationTool:
    | 'seedance_image_to_video'
    | 'seedance_multimodal_reference_to_video'
  referenceAudioUrl?: string
}

export function buildSeedanceGenerationTargets(
  production: ProductionView
): SeedanceGenerationTarget[] {
  const characters = new Map(
    production.characters.map((character) => [character.id, character])
  )
  return production.scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) => {
      const selectedVideo = shot.candidates.find(
        (candidate) => candidate.selected && candidate.kind === 'video'
      )
      if (selectedVideo) return []
      const image =
        shot.candidates.find(
          (candidate) =>
            candidate.selected &&
            candidate.kind === 'image' &&
            candidate.workspacePath
        ) ??
        shot.candidates.find(
          (candidate) =>
            candidate.kind === 'image' && candidate.workspacePath
        )
      if (!image?.workspacePath) return []
      const speaker = shot.dialogueSpeakerId
        ? characters.get(shot.dialogueSpeakerId)
        : undefined
      const voiceReference = compactVoiceReference(speaker?.voiceReference)
      const referenceAudioUrl = voiceReference?.url
      return [
        {
          sceneId: scene.id,
          shotId: shot.id,
          shotTitle: shot.title,
          durationSeconds: shot.durationSeconds,
          imageWorkspacePath: image.workspacePath,
          prompt: buildSynchronizedPrompt(
            production.visualStyle,
            scene,
            shot,
            speaker,
            voiceReference
          ),
          generationTool: referenceAudioUrl
            ? 'seedance_multimodal_reference_to_video'
            : 'seedance_image_to_video',
          ...(referenceAudioUrl ? { referenceAudioUrl } : {})
        }
      ]
    })
  )
}

export function buildSeedanceAssistantMessage(input: {
  projectId: string
  revision: number
  aspectRatio: string
  targets: SeedanceGenerationTarget[]
}) {
  return [
    `Generate real synchronized-audio Seedance videos for Story Studio project ${input.projectId}.`,
    `Initialize currentBaseRevision=${input.revision}. Use it for the first Story mutation, then set currentBaseRevision to the revision returned by every successful mutation receipt. Do not read the project summary only for revision.`,
    `For every target use model doubao-seedance-2-0-fast-260128, 720p, ratio ${input.aspectRatio}, watermark=false, generate_audio=true, and duration clamped to 4-15 seconds.`,
    'For a target whose generationTool is seedance_multimodal_reference_to_video, call it with input_mode=text_image_audio, reference_image_files=[imageWorkspacePath], and reference_audio_urls=[referenceAudioUrl]. The reference audio controls timbre; speak the exact dialogue from the prompt.',
    'If the multimodal tool is unavailable in this Assistant or the public reference audio cannot be read, fall back once to seedance_image_to_video with input_image_file=imageWorkspacePath and generate_audio=true. Never fall back to silent video.',
    'If the input image is rejected only for privacy-sensitive content, retry that target once with seedance_text_to_video using the same synchronized-audio prompt and generate_audio=true. Do not retry other provider failures automatically.',
    'Query every task with seedance_video_query. For each completed Workspace MP4 call story_attach_generated_video sequentially with currentBaseRevision, the exact sceneId and shotId, select=true, a task-derived candidateId, and provider receipt. After success, chain the returned revision into the next attachment. On a revision conflict, use error.currentRevision or call story_get_project_revision once if that field is unavailable.',
    `Targets:\n${JSON.stringify(input.targets, null, 2)}`
  ].join('\n\n')
}

export function buildSeedanceStatusAssistantMessage(input: {
  projectId: string
  revision: number
}) {
  return [
    `Continue the existing synchronized-audio Seedance workflow for Story Studio project ${input.projectId}.`,
    'Read the Seedance task IDs from the immediately preceding Assistant response in this thread. Do not create or resubmit any video-generation task.',
    'Query every existing task exactly once with seedance_video_query.',
    `Initialize currentBaseRevision=${input.revision}; do not read the project summary only for revision.`,
    'For each completed task that returns a Workspace MP4, call story_attach_generated_video sequentially with currentBaseRevision, the original sceneId and shotId from the preceding request, select=true, a task-derived candidateId, and the provider receipt. After success, use the returned revision for the next attachment.',
    'If a task is still processing, report its current status and task ID. If a task failed, report the provider failure without retrying or replacing it.',
    'After all completed videos are attached, report results from the attachment receipts. Read production only when selected-shot content must be verified; do not read the project summary only for revision.'
  ].join('\n\n')
}

function buildSynchronizedPrompt(
  visualStyle: string,
  scene: Scene,
  shot: Shot,
  speaker?: Character,
  voiceReference = compactVoiceReference(speaker?.voiceReference)
) {
  const audioDirection = shot.dialogue
    ? dialogueDirection(shot, speaker)
    : '无对白，人物不说话，嘴唇自然闭合。'
  const voiceAnchor = voiceReference
    ? `声线参考：${speaker?.name ?? '角色'}沿用“${voiceReference.label}”。`
    : ''
  const effects = shot.soundEffects.length
    ? `同期音效：${shot.soundEffects.join('、')}。`
    : '只生成与画面动作匹配的自然环境声。'
  const prompt = [
    audioDirection,
    voiceAnchor,
    effects,
    '不要背景音乐。',
    visualStyle,
    `${scene.location ?? scene.title}，${scene.timeOfDay ?? ''}`,
    shot.composition,
    shot.action,
    shot.camera
  ]
    .filter(Boolean)
    .join(' ')
  return prompt.slice(0, 500)
}

function dialogueDirection(shot: Shot, speaker?: Character) {
  const speakerName = speaker?.name ?? '画面中的说话角色'
  if (
    shot.dialogueType === 'voice_over' ||
    shot.dialogueType === 'off_screen'
  ) {
    return `${speakerName}以自然普通话准确说：“${shot.dialogue}”。这是画外音，画面人物嘴唇保持闭合。`
  }
  return `${speakerName}以自然普通话准确说：“${shot.dialogue}”。说话时嘴唇动作与语音同步，其他人物不张嘴。`
}
