import 'dotenv/config';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XinferenceSpeech2TextChatModel } from "./speech2text.js";


const __filename = fileURLToPath(import.meta.url);
const _dirname = dirname(__filename);
const sampleFilePath = join(_dirname, '..', '..', '..', '..', '__fixtures__', '16k16bit.wav');


describe('XinferenceSpeech2TextChatModel (live xinference)', () => {
  const baseURL = process.env.XINFERENCE_SERVER_URL
  const apiKey = process.env.XINFERENCE_API_KEY
  const model = process.env.XINFERENCE_SPEECH2TEXT_MODEL

  beforeAll(() => {
    if (!baseURL) {
      throw new Error('Missing XINFERENCE_SERVER_URL for live TTS test')
    }
    if (!model) {
      throw new Error('Missing XINFERENCE_SPEECH2TEXT_MODEL for live Speed2text test')
    }
    // if (!voice) {
    //   throw new Error('Missing XINFERENCE_TTS_VOICE for live TTS test')
    // }
  })

  it('generates real audio from Xinference TTS', async () => {
    const whisper = new XinferenceSpeech2TextChatModel({
      baseURL,
      model,
      language: "zh",
    });

    const text = await whisper.transcribeFile(sampleFilePath);
    console.log("Recognized:", text);
  })
})