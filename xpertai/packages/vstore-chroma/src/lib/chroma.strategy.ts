import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IVectorStoreStrategy, VectorStoreStrategy } from '@xpert-ai/plugin-sdk'
import { ChromaName } from './types.js'
import { VectorStore } from '@langchain/core/vectorstores'
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { Chroma } from '@langchain/community/vectorstores/chroma'

type ChromaVectorStoreConfig = {
  collectionName?: string
}

@Injectable()
@VectorStoreStrategy(ChromaName)
export class ChromaStrategy implements IVectorStoreStrategy<ChromaVectorStoreConfig> {
  name: string
  description?: string

  constructor(private readonly configService: ConfigService) {}

  validateConfig(): Promise<void> {
    return Promise.resolve()
  }

  async createStore(embeddings: EmbeddingsInterface, config: ChromaVectorStoreConfig): Promise<VectorStore> {
    const vectorStore = new Chroma(embeddings, {
      collectionName: config.collectionName || 'default',
      url: this.configService.get<string>('CHROMA_URL')
    })
    return vectorStore
  }
}
