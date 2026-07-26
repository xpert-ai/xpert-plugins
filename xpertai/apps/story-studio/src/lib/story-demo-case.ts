import type {
  StoryMediaCandidate,
  StoryPortableFileReference,
  StoryProductionDocument
} from './production-types.js'

export const STORY_DEMO_TITLE = '朱门账影 · Story Studio 工作流示例'

export const STORY_DEMO_ASSETS = [
  {
    key: 'shot-01',
    fileName: 'shot-01.png',
    mimeType: 'image/png'
  },
  {
    key: 'shot-02',
    fileName: 'shot-02.png',
    mimeType: 'image/png'
  },
  {
    key: 'shot-03',
    fileName: 'shot-03.png',
    mimeType: 'image/png'
  }
] as const

export type StoryDemoAssetKey = (typeof STORY_DEMO_ASSETS)[number]['key']

export type StoryDemoMedia = {
  key: StoryDemoAssetKey
  fileName: string
  mimeType: string
  fileUrl?: string
  workspacePath: string
  size: number
  sha256: string
  fileReference: StoryPortableFileReference
}

export function createStoryDemoProduction(
  media: Record<StoryDemoAssetKey, StoryDemoMedia>
): StoryProductionDocument {
  const shotOne = mediaCandidate(media['shot-01'], 'frame-rain-ledger', '雨夜闺房定场帧')
  const shotTwo = mediaCandidate(media['shot-02'], 'frame-maid-warning', '丫鬟闯入中景帧')
  const shotThree = mediaCandidate(media['shot-03'], 'frame-hide-ledger', '藏账册决断近景帧')

  return {
    sourceSynopsis:
      '雨夜，洛绾在祖母遗物中发现一本朱红账册。贴身侍女青桃闯入，告知前院来人搜查。洛绾意识到账册记录着能改变家族命运的秘密，决定先把它藏起来。',
    adaptationGoal:
      '制作一支 15 秒竖屏古风悬疑短剧样片，用三个连续镜头完成“发现—打断—决断”的微型叙事，并保持角色、场景、道具和光影一致。',
    visualStyle:
      '电影级古风写实，雨夜冷蓝环境光与烛火暖光对冲，深木色空间、玉绿色人物服装和朱红账册形成稳定色彩锚点。',
    audience: '偏好古风、悬疑和强情节竖屏短剧的移动端观众。',
    sourceMaterials: [
      {
        id: 'source-hidden-ledger',
        title: '原创梗概：雨夜账册',
        type: 'text',
        status: 'reviewed',
        excerpt:
          '洛绾整理祖母遗物时发现朱红账册。青桃冒雨来报，前院有人搜查旧物。洛绾合上账册，决定先隐瞒发现，再查明账目背后的真相。'
      }
    ],
    storyPlan: {
      logline: '一位深宅小姐在搜查者到来前，必须决定是否藏起足以颠覆家族的秘密账册。',
      theme: '真相需要勇气，也需要时机。',
      tone: '克制、紧张、带一点古风权谋感。',
      beats: [
        {
          id: 'beat-discovery',
          title: '发现',
          summary: '洛绾在祖母遗物中打开朱红账册。',
          purpose: '用场景和道具建立秘密的存在。'
        },
        {
          id: 'beat-interruption',
          title: '打断',
          summary: '青桃推门而入，前院搜查的威胁逼近。',
          purpose: '把静态发现转化为即时选择。'
        },
        {
          id: 'beat-decision',
          title: '决断',
          summary: '洛绾把账册收入袖中，决定拖住来人。',
          purpose: '以人物动作完成悬念钩子。'
        }
      ]
    },
    episodes: [
      {
        id: 'episode-01',
        order: 1,
        title: '雨夜账影',
        summary: '洛绾发现秘密账册，并在搜查者到来前将它藏起。',
        targetDurationSeconds: 15,
        script:
          '内景·洛绾闺房·夜\n雨打窗棂。洛绾从祖母的旧匣中取出一本朱红账册。\n青桃推门而入：小姐，前院来人了。\n洛绾合上账册，将它收入袖中。\n洛绾：让他们等。账，得先看完。'
      }
    ],
    assets: [
      {
        id: 'asset-luowan',
        kind: 'character',
        name: '洛绾',
        description: '二十余岁的深宅小姐，冷静敏锐，玉绿色衣裙和玉簪是连续性锚点。',
        prompt:
          'young Chinese noblewoman, pale jade-green historical hanfu, restrained updo, jade hairpin, calm intelligent eyes, cinematic realism',
        candidates: [
          cloneCandidate(shotThree, 'asset-luowan-reference', '洛绾角色参考')
        ]
      },
      {
        id: 'asset-qingtao',
        kind: 'character',
        name: '青桃',
        description: '洛绾的贴身侍女，深青色衣裙，行动急切，表情直白。',
        prompt:
          'young Chinese maid, dark teal historical clothing, anxious expression, rain at doorway, cinematic realism',
        candidates: [
          cloneCandidate(shotTwo, 'asset-qingtao-reference', '青桃角色参考')
        ]
      },
      {
        id: 'asset-bedchamber',
        kind: 'location',
        name: '雨夜闺房',
        description: '深木色古代闺房，雕花格窗、纱帘与烛台构成前中后景，窗外持续落雨。',
        prompt:
          'ancient Chinese noblewoman bedchamber at rainy night, carved wood screens, gauze curtains, candlelight, cool blue rain light',
        candidates: [
          cloneCandidate(shotOne, 'asset-bedchamber-reference', '雨夜闺房场景参考')
        ]
      },
      {
        id: 'asset-ledger',
        kind: 'prop',
        name: '朱红账册',
        description: '小开本朱红封皮账册，无可辨识文字，是三个镜头中的剧情焦点。',
        prompt:
          'small vermilion ancient account ledger, aged paper edges, no visible writing, cinematic prop reference',
        candidates: [
          cloneCandidate(shotTwo, 'asset-ledger-reference', '朱红账册道具参考')
        ]
      }
    ],
    characters: [
      {
        id: 'character-luowan',
        name: '洛绾',
        role: '主角',
        visualDescription: '玉绿色古装、玉簪、克制而敏锐的神情。'
      },
      {
        id: 'character-qingtao',
        name: '青桃',
        role: '侍女',
        visualDescription: '深青色古装、利落发髻、紧张而直接的神情。'
      }
    ],
    scenes: [
      {
        id: 'scene-rain-room',
        order: 1,
        title: '雨夜闺房',
        summary: '一场雨夜中的秘密发现，被突然到来的搜查消息打断。',
        location: '洛绾闺房',
        timeOfDay: '雨夜',
        shots: [
          {
            id: 'shot-discovery',
            title: '纱幕后发现',
            composition: '纱帘形成前景遮挡，洛绾和书案位于画面下部，格窗与雨夜拉开空间纵深。',
            action: '洛绾从旧匣中取出朱红账册，低头翻开。',
            camera: '远景，缓慢推近',
            soundEffects: ['雨声', '旧匣开启声', '纸页轻响'],
            durationSeconds: 5,
            candidates: [shotOne]
          },
          {
            id: 'shot-warning',
            title: '推门来报',
            composition: '洛绾在前景三分之二处，青桃被门框完整框入后景。',
            action: '洛绾抬头，青桃冒雨推门闯入。',
            camera: '中景，焦点由账册转向门口',
            dialogue: '小姐，前院来人了。',
            dialogueSpeakerId: 'character-qingtao',
            dialogueType: 'dialogue',
            soundEffects: ['木门推开声', '雨声'],
            durationSeconds: 5,
            candidates: [shotTwo]
          },
          {
            id: 'shot-decision',
            title: '藏账决断',
            composition: '洛绾占据前景，账册与宽袖动作清晰，青桃在后景关门。',
            action: '洛绾起身将账册收入袖中，目光转为坚定。',
            camera: '近景，轻微低角度推近',
            dialogue: '让他们等。账，得先看完。',
            dialogueSpeakerId: 'character-luowan',
            dialogueType: 'dialogue',
            soundEffects: ['纸页轻响', '雨声'],
            durationSeconds: 5,
            candidates: [shotThree]
          }
        ]
      }
    ]
  }
}

function mediaCandidate(
  media: StoryDemoMedia,
  id: string,
  label: string
): StoryMediaCandidate {
  return {
    id,
    kind: 'image',
    label,
    selected: true,
    ...(media.fileUrl ? { fileUrl: media.fileUrl } : {}),
    workspacePath: media.workspacePath,
    prompt: `${label}，古风写实电影感，保持角色、场景、道具与冷暖光一致。`,
    originalName: media.fileName,
    mimeType: media.mimeType,
    size: media.size,
    sha256: media.sha256,
    fileReference: media.fileReference
  }
}

function cloneCandidate(
  candidate: StoryMediaCandidate,
  id: string,
  label: string
): StoryMediaCandidate {
  return {
    ...candidate,
    id,
    label
  }
}
