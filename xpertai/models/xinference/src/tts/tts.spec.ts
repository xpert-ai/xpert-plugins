import 'dotenv/config';

import { HumanMessage } from '@langchain/core/messages'
import { TTSChatModel } from './tts.js'
import { XinferenceTTS } from './xinference-tts.js'
import fs from 'fs'

describe('TTSChatModel (live xinference)', () => {
  const baseUrl = process.env.XINFERENCE_SERVER_URL
  const apiKey = process.env.XINFERENCE_API_KEY
  const model = process.env.XINFERENCE_TTS_MODEL
  const voice = process.env.XINFERENCE_TTS_VOICE
  const prompt = process.env.XINFERENCE_TTS_PROMPT ?? '请把这段话转换成音频输出，控制在 5 秒内。'

  beforeAll(() => {
    if (!baseUrl) {
      throw new Error('Missing XINFERENCE_SERVER_URL for live TTS test')
    }
    if (!model) {
      throw new Error('Missing XINFERENCE_TTS_MODEL for live TTS test')
    }
    // if (!voice) {
    //   throw new Error('Missing XINFERENCE_TTS_VOICE for live TTS test')
    // }
  })

  it('generates real audio from Xinference TTS', async () => {
      const tts = new XinferenceTTS({
      baseURL: baseUrl,
      model: model,    // 替换成你的 TTS model
      voice: "",
      // format: "mp3",
    });

    const audio = await tts.generate("你好，我是 XpertAI 智能体！");
    fs.writeFileSync("output.mp3", audio);
    console.log("✅ DONE: output.mp3");
  })

  it(
    'streams real audio chunks from Xinference TTS',
    async () => {
      const chatModel = new TTSChatModel({
        baseUrl,
        apiKey,
        model,
        voice
      })

      const stream = await chatModel.stream([new HumanMessage(prompt)])
      const audioChunks: any[] = []

      for await (const chunk of stream) {
        const content = chunk.message?.content
        const parts = Array.isArray(content) ? content : [content]
        const audioPart = parts.find((part: any) => part?.type === 'audio')
        if (audioPart) {
          audioChunks.push(audioPart)
          expect(audioPart?.format ?? audioPart?.mime_type ?? audioPart?.mimeType).toBeDefined()
          expect(audioPart?.data ?? audioPart?.audio?.data ?? audioPart?.audio).toBeDefined()
        }
      }

      console.log(`Received ${audioChunks.length} Xinference TTS chunks`)
      expect(audioChunks.length).toBeGreaterThan(0)
    },
    30000
  )
})
