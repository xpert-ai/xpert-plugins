import { Injectable } from '@nestjs/common';
import { AiModelTypeEnum } from '@metad/contracts';
import {
  CredentialsValidateFailedError,
  mergeCredentials,
  TextToSpeechModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxModelCredentials, SUPPORTED_TTS_MODELS, toCredentialKwargs } from '../types.js';

export interface MiniMaxTTSOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  language?: string;
}

export interface MiniMaxTTSResponse {
  audioData: ArrayBuffer;
  contentType: string;
}

interface MiniMaxTTSResponseData {
  audio?: string;
  data?: {
    audio?: string;
  };
  base_resp?: {
    status_code: number;
    status_msg?: string;
  };
}

@Injectable()
export class MiniMaxTTSModel extends TextToSpeechModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TTS);
  }

  async synthesizeSpeech(
    model: string,
    text: string,
    credentials: MiniMaxModelCredentials,
    options?: MiniMaxTTSOptions
  ): Promise<MiniMaxTTSResponse> {
    const params = toCredentialKwargs(credentials, model);
    // Remove /v1 from baseURL if present, then add it back
    const baseURL = params.configuration.baseURL.replace(/\/v1$/, '').replace(/\/$/, '');
    const url = `${baseURL}/v1/t2a_v2?GroupId=${params.groupId}`;
    
    const payload = {
      model,
      text,
      stream: true, // MiniMax TTS always uses streaming
      voice_setting: {
        voice_id: options?.voice ?? 'male-qn-qingse',
        speed: options?.speed ?? 1.0,
        vol: 1.0,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: (options?.format ?? 'mp3') as string, // Ensure format is a string
        channel: 1
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax TTS request failed: ${response.status} ${errorText}`);
    }

    // Check content type to determine response format
    const responseContentType = response.headers.get('content-type') || '';
    
    // If response is JSON (non-streaming), handle it directly
    if (responseContentType.includes('application/json')) {
      const result = (await response.json()) as MiniMaxTTSResponseData;
      if (result.base_resp?.status_code !== 0) {
        const code = result.base_resp?.status_code;
        const msg = result.base_resp?.status_msg || 'Unknown error';
        throw new Error(`MiniMax TTS API error: ${code} ${msg}`);
      }
      
      // Extract audio from JSON response
      let audioData: ArrayBuffer;
      if (result.data?.audio) {
        const audioHex = result.data.audio;
        const audioBytes = new Uint8Array(
          audioHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
        );
        audioData = new ArrayBuffer(audioBytes.length);
        new Uint8Array(audioData).set(audioBytes);
      } else {
        throw new Error('No audio data in MiniMax TTS JSON response');
      }
      
      const audioContentType = options?.format === 'wav' ? 'audio/wav' : 
                              options?.format === 'flac' ? 'audio/flac' :
                              options?.format === 'opus' ? 'audio/opus' :
                              options?.format === 'aac' ? 'audio/aac' :
                              'audio/mpeg';
      
      return { audioData, contentType: audioContentType };
    }

    // MiniMax TTS returns streaming response with data: prefix
    // Collect all audio chunks from the stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    const audioChunks: Uint8Array[] = [];
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue; // Skip empty lines
          
          if (trimmedLine.startsWith('data:')) {
            try {
              const jsonStr = trimmedLine.slice(5).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue; // Skip empty or done markers
              
              const data = JSON.parse(jsonStr);
              // Check for audio data in different possible locations
              if (data.data?.audio) {
                // Audio is in hex format
                const audioHex = data.data.audio;
                const audioBytes = new Uint8Array(
                  audioHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                audioChunks.push(audioBytes);
              } else if (data.audio) {
                // Direct audio in data object
                const audioHex = typeof data.audio === 'string' ? data.audio : '';
                if (audioHex) {
                  const audioBytes = new Uint8Array(
                    audioHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                  );
                  audioChunks.push(audioBytes);
                }
              }
            } catch (e) {
              // Skip invalid JSON chunks - might be non-JSON data
              continue;
            }
          } else if (trimmedLine.startsWith('{')) {
            // Try to parse as JSON even without 'data:' prefix
            try {
              const data = JSON.parse(trimmedLine);
              if (data.data?.audio) {
                const audioHex = data.data.audio;
                const audioBytes = new Uint8Array(
                  audioHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                audioChunks.push(audioBytes);
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmedBuffer = buffer.trim();
        if (trimmedBuffer.startsWith('data:')) {
          try {
            const jsonStr = trimmedBuffer.slice(5).trim();
            if (jsonStr) {
              const data = JSON.parse(jsonStr);
              if (data.data?.audio) {
                const audioHex = data.data.audio;
                const audioBytes = new Uint8Array(
                  audioHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                audioChunks.push(audioBytes);
              }
            }
          } catch (e) {
            // Ignore parse errors for remaining buffer
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (audioChunks.length === 0) {
      throw new Error('No audio data received from MiniMax TTS. Check if the API response format matches expectations.');
    }

    // Combine all audio chunks into a single ArrayBuffer
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audioData = new ArrayBuffer(totalLength);
    const audioView = new Uint8Array(audioData);
    let offset = 0;
    for (const chunk of audioChunks) {
      audioView.set(chunk, offset);
      offset += chunk.length;
    }

    const contentType = options?.format === 'wav' ? 'audio/wav' : 
                        options?.format === 'flac' ? 'audio/flac' :
                        options?.format === 'opus' ? 'audio/opus' :
                        options?.format === 'aac' ? 'audio/aac' :
                        'audio/mpeg';

    return { audioData, contentType };
  }

  getTTSInstance(model: string, credentials: MiniMaxModelCredentials, options?: TChatModelOptions) {
    const merged = mergeCredentials(credentials, options?.modelProperties) as MiniMaxModelCredentials;
    return {
      model,
      synthesizeSpeech: (text: string, ttsOptions?: MiniMaxTTSOptions) =>
        this.synthesizeSpeech(model, text, merged, ttsOptions)
    };
  }

  async validateCredentials(model: string, credentials: MiniMaxModelCredentials): Promise<void> {
    if (!model || !SUPPORTED_TTS_MODELS.includes(model)) {
      throw new CredentialsValidateFailedError(`TTS model ${model} is not supported`);
    }
    if (!credentials.api_key) {
      throw new CredentialsValidateFailedError('API key is required');
    }
    if (!credentials.group_id) {
      throw new CredentialsValidateFailedError('Group ID is required');
    }
  }

  static getSupportedModels() {
    return SUPPORTED_TTS_MODELS;
  }
}