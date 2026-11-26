const MODEL_OPTIONS = [
  ['gemini-omni-1.2-flash', 'Gemini Omni 1.2 Flash']
] as const

function i18n(en_US: string, zh_Hans: string) {
  return { en_US, zh_Hans }
}

function enumLabels(options: readonly (readonly [string, string])[]) {
  return Object.fromEntries(options.map(([value, label]) => [value, label]))
}

const workspaceFileProperty = {
  anyOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      properties: {
        source: { type: 'string' },
        filePath: { type: 'string' },
        workspacePath: { type: 'string' },
        path: { type: 'string' },
        mimeType: { type: 'string' },
        originalName: { type: 'string' },
        name: { type: 'string' }
      },
      additionalProperties: true
    }
  ]
} as const

const promptProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 1024,
  title: 'Prompt',
  description: 'Video description including subject, action, camera, and audio cues.',
  'x-ui': {
    title: i18n('Prompt', '提示词'),
    description: i18n(
      'Describe the subject, action, camera, style, dialogue, and sound.',
      '描述主体、动作、镜头、风格、对白与声音。'
    )
  }
} as const

const modelProperty = {
  type: 'string',
  enum: MODEL_OPTIONS.map(([value]) => value),
  default: 'gemini-omni-1.2-flash',
  title: 'Model',
  'x-ui': {
    title: i18n('Model', '生成模型'),
    description: i18n('Veo model used for generation.', '用于生成视频的 Veo 模型。'),
    enumLabels: enumLabels(MODEL_OPTIONS)
  }
} as const

const resolutionProperty = {
  type: 'string',
  enum: ['360p', '720p', '1080p', '4k'],
  default: '720p',
  title: 'Resolution',
  'x-ui': {
    title: i18n('Resolution', '视频分辨率'),
    description: i18n(
      'Output video resolution.',
      '输出视频分辨率。'
    )
  }
} as const

const ratioProperty = {
  type: 'string',
  enum: ['16:9', '9:16'],
  default: '16:9',
  title: 'Aspect ratio',
  'x-ui': {
    title: i18n('Aspect ratio', '画面比例'),
    description: i18n('Generated video aspect ratio.', '生成视频的画面比例。')
  }
} as const

const durationProperty = {
  anyOf: [
    { type: 'integer', minimum: 3, maximum: 15 },
    { type: 'string', pattern: '^(?:[3-9]|1[0-5])$' }
  ],
  default: 8,
  title: 'Duration',
  'x-ui': {
    title: i18n('Duration', '视频时长'),
    description: i18n('Video duration: 3 to 15 seconds, up to 10 for frame interpolation.', '视频时长：3 至 15 秒，首尾帧最多 10 秒。')
  }
} as const

const generateAudioProperty = {
  anyOf: [
    { type: 'boolean' },
    { type: 'string', enum: ['true', 'false'] }
  ],
  default: 'true',
  title: 'Generate audio',
  'x-ui': {
    title: i18n('Generate audio', '生成音频'),
    description: i18n(
      'Gemini Omni always generates synchronized audio.',
      'Gemini Omni 始终生成同步音频。'
    )
  }
} as const

const commonProperties = {
  prompt: promptProperty,
  model: modelProperty,
  resolution: resolutionProperty,
  ratio: ratioProperty,
  duration: durationProperty,
  generate_audio: generateAudioProperty
} as const

function objectSchema(
  properties: Record<string, unknown>,
  required: string[]
) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false
  } as const
}

export const textToVideoSchema = objectSchema(commonProperties, ['prompt'])

export const imageToVideoSchema = objectSchema(
  {
    ...commonProperties,
    input_image_file: {
      ...workspaceFileProperty,
      title: 'Initial image',
      'x-ui': {
        title: i18n('Initial image', '首帧图片'),
        description: i18n(
          'Workspace image used as the first frame.',
          '作为视频首帧的工作区图片。'
        )
      }
    }
  },
  ['prompt', 'input_image_file']
)

export const firstLastFrameToVideoSchema = objectSchema(
  {
    ...commonProperties,
    first_frame_file: {
      ...workspaceFileProperty,
      title: 'First frame',
      'x-ui': {
        title: i18n('First frame', '首帧图片'),
        description: i18n('Starting frame image.', '视频开始画面。')
      }
    },
    last_frame_file: {
      ...workspaceFileProperty,
      title: 'Final frame',
      'x-ui': {
        title: i18n('Final frame', '尾帧图片'),
        description: i18n('Ending frame image.', '视频结束画面。')
      }
    }
  },
  ['prompt', 'first_frame_file', 'last_frame_file']
)

export const referenceToVideoSchema = objectSchema(
  {
    ...commonProperties,
    reference_image_files: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: workspaceFileProperty,
      title: 'Asset reference images',
      'x-ui': {
        title: i18n('Asset reference images', '资产参考图片'),
        description: i18n(
          'One to six reference images of people, characters or products.',
          '1 至 6 张人物、角色或产品参考图片。'
        )
      }
    }
  },
  ['prompt', 'reference_image_files']
)

export const videoQuerySchema = objectSchema(
  {
    task_id: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      title: 'Generation task',
      'x-ui': {
        title: i18n('Generation task', '生成任务'),
        description: i18n(
          'Task identifier returned by a Veo submit tool.',
          '由 Veo 提交工具返回的生成任务标识。'
        )
      }
    },
    model: modelProperty,
    download_video: {
      anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false'] }],
      default: 'true',
      title: 'Save completed video',
      'x-ui': {
        title: i18n('Save completed video', '保存成片'),
        description: i18n(
          'Download a completed video into Workspace Files.',
          '将已完成的视频保存到工作区文件。'
        )
      }
    },
    wait_seconds: {
      type: 'integer',
      minimum: 0,
      maximum: 45,
      default: 0,
      title: 'Bounded wait',
      'x-ui': {
        title: i18n('Bounded wait', '有界等待'),
        description: i18n(
          'Optionally wait up to 45 seconds before returning the current status.',
          '可在返回当前状态前最多等待 45 秒。'
        )
      }
    }
  },
  ['task_id']
)
