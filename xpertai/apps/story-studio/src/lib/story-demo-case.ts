import type {
  StoryMediaCandidate,
  StoryPortableFileReference,
  StoryProductionDocument
} from './production-types.js'

export const STORY_DEMO_TITLE = '逆光重逢'

export const STORY_DEMO_ASSETS = [
  { key: 'shot-01', fileName: 'shot-01.png', mimeType: 'image/png' },
  { key: 'shot-02', fileName: 'shot-02.png', mimeType: 'image/png' },
  { key: 'shot-03', fileName: 'shot-03.png', mimeType: 'image/png' }
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

type StoryShot = StoryProductionDocument['scenes'][number]['shots'][number]

const SHOTS = [
  ['S11', '影棚外全景', '雨夜旧影棚外景，远处灯光穿过雨幕。', '缓慢推近', 8],
  ['S12', '雨夜旧影棚重逢', '林晚与顾沉隔雨相望。', '中景双人，轻微推近', 7],
  ['S13', '两人对峙', '顾沉上前一步，林晚握紧相机。', '近景双人', 6],
  ['S14', '转身离开', '林晚压下情绪，转身走向影棚。', '侧后跟拍', 6],
  ['S21', '空镜 · 摄影棚内部', '积灰灯架与旧布景形成纵深。', '固定全景', 6],
  ['S22', '女主演准备', '林晚擦去旧相机上的雨水。', '中近景', 7],
  ['S23', '男主演沉思', '顾沉望向封存的胶片柜。', '近景缓推', 6],
  ['S24', '对话开始', '两人围绕未完成的纪录片试探。', '双人过肩', 10],
  ['S25', '监视眼神特写', '顾沉发现窗外一闪而过的人影。', '特写快速推近', 5],
  ['S31', '化妆间全景', '旧镜前灯泡逐个亮起。', '固定全景', 6],
  ['S32', '女主演独白', '林晚对着镜子承认自己从未忘记。', '镜面中近景', 9],
  ['S33', '回忆插入', '多年前两人在片场并肩工作的片段。', '手持回忆镜头', 8],
  ['S34', '情绪低落', '林晚低下头，雨水从风衣袖口滴落。', '特写缓推', 6]
] as const

export function createStoryDemoProduction(
  media: Record<StoryDemoAssetKey, StoryDemoMedia>
): StoryProductionDocument {
  const frames = [
    mediaCandidate(media['shot-01'], 'frame-rainy-studio-wide', '雨夜旧影棚全景'),
    mediaCandidate(media['shot-02'], 'frame-rainy-studio-close', '雨夜重逢近景'),
    mediaCandidate(media['shot-03'], 'frame-lin-wan-identity', '林晚身份参考')
  ]
  const shots = SHOTS.map((definition, index) =>
    createShot(definition, index, frames[index % frames.length])
  )

  return {
    sourceSynopsis:
      '雨夜，纪录片摄影师林晚在废弃旧影棚与失联多年的搭档顾沉重逢，两人被迫面对一段未完成的影片与被刻意掩埋的事故。',
    adaptationGoal:
      '用 96 秒竖屏短剧完成久别重逢、克制试探与悬念再起，并严格保持人物、雨夜旧影棚和旧相机的一致性。',
    visualStyle:
      '电影级都市情感悬疑，冷蓝雨夜与暖色旧灯对冲，低饱和、真实湿润质感、克制表演。',
    audience: '偏好都市情感、悬疑和强人物关系的竖屏短剧观众。',
    sourceMaterials: [
      {
        id: 'source-backlight-reunion',
        title: '原创梗概：逆光重逢',
        type: 'text',
        status: 'reviewed',
        excerpt:
          '林晚抱着旧相机回到第七摄影棚，顾沉从雨幕中出现。两人围绕未完成的纪录片试探彼此。'
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
          episodeId: 'episode-01',
          sceneId: 'scene-rainy-exterior',
          shotId: 'shot-s12',
          originalText: '她看见他，停下脚步。',
          suggestedText: '林晚在雨里停住，手指下意识攥紧相机背带。',
          reason: '把抽象情绪改成可拍摄的身体动作，同时保留人物的克制。',
          status: 'pending',
          createdBy: 'assistant',
          createdAt: '2026-08-06T01:00:00.000Z'
        }
      ]
    },
    episodes: [
      {
        id: 'episode-01',
        order: 1,
        title: '雨夜重逢',
        summary: '林晚和顾沉在第七摄影棚重逢，未完成的纪录片重新把他们绑在一起。',
        targetDurationSeconds: 96,
        script:
          '外景·雨夜·旧影棚外\n雨幕笼住废弃摄影棚。林晚抱着旧相机停在门口，顾沉从暗处走来。\n她看见他，停下脚步。\n林晚：你还是来了。\n顾沉：我只是来拿回属于我的东西。\n两人隔着雨帘对视。远处闪电照亮褪色的“第七摄影棚”招牌。'
      }
    ],
    assets: [
      characterAsset('asset-linwan', '林晚', '独立纪录片摄影师，外冷内韧，肩长黑发，米色风衣。', cloneCandidate(frames[2], 'asset-linwan-v3', '林晚 V3 身份包')),
      characterAsset('asset-guchen', '顾沉', '纪录片摄影师，克制寡言，黑色皮衣。', cloneCandidate(frames[1], 'asset-guchen-v3', '顾沉 V3 身份包')),
      characterAsset('asset-zhouqi', '周启', '调查记者，身份待确认。'),
      characterAsset('asset-chenfang', '陈放', '旧影棚管理员。'),
      simpleAsset('asset-studio-exterior', 'location', '旧影棚外 · 雨夜', '第七摄影棚外，夜雨，湿地反光。', cloneCandidate(frames[0], 'asset-studio-exterior-v1', '旧影棚外场景参考')),
      simpleAsset('asset-studio-interior', 'location', '摄影棚内部', '封存布景和积灰灯架。'),
      simpleAsset('asset-dressing-room', 'location', '旧化妆间', '镜前旧灯泡与斑驳墙面。'),
      simpleAsset('asset-camera', 'prop', '旧相机', '林晚一直携带的旧纪录片相机。'),
      simpleAsset('asset-film', 'prop', '未完成胶片', '顾沉要取回的关键证据。'),
      simpleAsset('asset-style', 'style', '逆光雨夜', '冷蓝雨夜与暖色逆光。')
    ],
    characters: [
      { id: 'character-linwan', name: '林晚', role: '女主 / 纪录片摄影师', visualDescription: '肩长黑发、米色风衣、右眼下浅痣。' },
      { id: 'character-guchen', name: '顾沉', role: '男主 / 纪录片摄影师', visualDescription: '黑色湿发、黑色皮衣、冷峻克制。' },
      { id: 'character-zhouqi', name: '周启', role: '调查记者', visualDescription: '干净利落，谨慎。' },
      { id: 'character-chenfang', name: '陈放', role: '影棚管理员', visualDescription: '沉默寡言。' }
    ],
    scenes: [
      { id: 'scene-rainy-exterior', episodeId: 'episode-01', order: 1, title: '雨夜 · 旧影棚外', summary: '林晚与顾沉在废弃摄影棚外久别重逢。', location: '旧影棚外', timeOfDay: '雨夜', shots: shots.slice(0, 4) },
      { id: 'scene-studio-interior', episodeId: 'episode-01', order: 2, title: '影棚内 · 摄影棚', summary: '两人在未完成的纪录片现场继续试探。', location: '摄影棚内部', timeOfDay: '夜', shots: shots.slice(4, 9) },
      { id: 'scene-dressing-room', episodeId: 'episode-01', order: 3, title: '化妆间', summary: '林晚独处时，记忆和现实交叠。', location: '旧化妆间', timeOfDay: '夜', shots: shots.slice(9) }
    ]
  }
}

function createShot(
  definition: (typeof SHOTS)[number],
  index: number,
  frame: StoryMediaCandidate
): StoryShot {
  return {
    id: `shot-${definition[0].toLowerCase()}`,
    title: definition[1],
    composition: definition[2],
    action: definition[2],
    camera: definition[3],
    generationPrompt: `${definition[2]}，${definition[3]}，电影级都市悬疑，冷蓝雨夜与暖色旧灯，角色身份一致。`,
    emotion: index < 4 ? '克制、试探、隐忍' : '警觉、压抑、悬念升高',
    lens: index % 3 === 0 ? '24mm' : index % 3 === 1 ? '35mm' : '50mm',
    lighting: '冷色环境光 + 暖色侧逆光',
    colorTone: '低饱和冷暖对比',
    weather: index < 4 ? '雨夜' : '室内潮湿夜景',
    ...(index === 1
      ? { dialogue: '你还是来了。', dialogueSpeakerId: 'character-linwan', dialogueType: 'dialogue' as const }
      : index === 2
        ? { dialogue: '我只是来拿回属于我的东西。', dialogueSpeakerId: 'character-guchen', dialogueType: 'dialogue' as const }
        : {}),
    soundEffects: ['雨声', '远处雷声'],
    durationSeconds: definition[4],
    candidates: [cloneCandidate(frame, `candidate-${definition[0].toLowerCase()}-image`, `${definition[1]}主画面`)]
  }
}

function characterAsset(
  id: string,
  name: string,
  description: string,
  candidate?: StoryMediaCandidate
): NonNullable<StoryProductionDocument['assets']>[number] {
  return {
    id,
    kind: 'character',
    name,
    description,
    prompt: `${name}角色身份包，电影级写实，严格保持面部、发型与服装连续性。`,
    negativePrompt: '避免脸型漂移、发型变化、服装换色、年龄变化与塑料皮肤。',
    continuityNotes: `${name}在全剧镜头中保持同一面部、发型、体型与主服装。`,
    categoryDetails: {
      identity: description,
      appearance: name === '林晚' ? '肩长黑发 / 清冷轮廓 / 右眼下浅痣' : '黑色湿发 / 冷峻轮廓 / 克制眼神',
      wardrobe: name === '林晚' ? '米色风衣 / 深灰针织衫' : '黑色皮衣 / 深色高领衫',
      voice: name === '林晚' ? '清透女声 / 克制' : '低沉男声 / 寡言',
      continuity: '身份包锁定后，新镜头默认继承全部人物锚点。'
    },
    candidates: candidate ? [candidate] : []
  }
}

function simpleAsset(
  id: string,
  kind: 'location' | 'prop' | 'style',
  name: string,
  description: string,
  candidate?: StoryMediaCandidate
): NonNullable<StoryProductionDocument['assets']>[number] {
  return {
    id,
    kind,
    name,
    description,
    prompt: `${description} 电影级雨夜写实，低饱和冷暖对比。`,
    negativePrompt: '避免现代无关元素、文字水印、过度霓虹与空间结构漂移。',
    continuityNotes: `${name}在所有关联镜头中保持材质、尺度、位置与光线关系一致。`,
    categoryDetails:
      kind === 'location'
        ? {
            environment: description,
            lighting: '冷蓝环境光 / 暖色旧灯 / 潮湿反光',
            continuity: '门窗、灯架、镜前灯与主通道位置固定。'
          }
        : kind === 'prop'
          ? {
              material: '磨损金属 / 旧皮革 / 使用痕迹清晰',
              condition: '旧但可用，关键细节不能改变',
              storyFunction: description,
              continuity: '持有人、朝向、破损位置与镜头接续一致。'
            }
          : {
              palette: '冷蓝、炭黑、旧钨丝暖金',
              lighting: '低调光 / 侧逆光 / 湿润高光',
              lens: '24–50mm 写实电影镜头，浅景深克制使用',
              continuity: '全片维持低饱和冷暖对冲与真实雨夜质感。'
            },
    candidates: candidate ? [candidate] : []
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
    prompt: `${label}，电影级雨夜写实，保持人物、场景、道具与冷暖光一致。`,
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
  return { ...candidate, id, label }
}
