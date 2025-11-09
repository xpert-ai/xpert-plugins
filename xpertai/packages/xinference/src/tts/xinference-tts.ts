import { OpenAI } from "openai";

/**
 * Xinference TTS Wrapper
 * For OpenAI-compatible /v1/audio/speech
 */
export interface XinferenceTTSOptions {
  baseURL: string;        // e.g. http://localhost:9997/v1
  apiKey?: string;        // optional
  model: string;          // TTS model name
  voice?: string;         // optional
  format?: "mp3" | "wav" | "flac";
  speed?: number;
}

export class XinferenceTTS {
  private client: OpenAI;
  private model: string;
  private voice?: string;
  private format?: string;
  private speed?: number;

  constructor(options: XinferenceTTSOptions) {
    this.client = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey ?? "not-required",  // Xinference 兼容模式无需 Key
    });

    this.model = options.model;
    this.voice = options.voice;
    this.format = options.format ?? "mp3";
    this.speed = options.speed;
  }

  /**
   * Generate audio from text
   * return Buffer
   */
  async generate(inputText: string): Promise<Buffer> {
    const response = await this.client.audio.speech.create({
      model: this.model,
      input: inputText,
      voice: this.voice,
    });

    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Generate and return base64
   */
  async generateAsBase64(inputText: string): Promise<string> {
    const response = await this.client.audio.speech.create({
      model: this.model,
      input: inputText,
      voice: this.voice,
      response_format: this.format as any,  // to bypass type check
    });

    return response as unknown as string;
  }
}
