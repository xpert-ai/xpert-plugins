import axios from 'axios';
import { Document } from '@langchain/core/documents';
import type { IIntegration } from '@metad/contracts';
import { InternalServerErrorException } from '@nestjs/common';
import { FastGPTKnowledgeStrategy } from './fastgpt-knowledge.strategy.js';

jest.mock('@nestjs/common', () => {
  class InternalServerErrorException extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'InternalServerErrorException';
    }
  }

  const Injectable =
    () =>
    <T extends new (...args: any[]) => unknown>(target: T): T =>
      target;

  return {
    __esModule: true,
    InternalServerErrorException,
    Injectable,
  };
});

jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  KnowledgeStrategyKey: () => () => undefined,
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

const postMock = axios.post as jest.Mock;

describe('FastGPTKnowledgeStrategy', () => {
  let strategy: FastGPTKnowledgeStrategy;
  let integration: IIntegration;

  const buildPayload = () =>
    ({
      query: 'What is FastGPT?',
      k: 3,
      options: {
        knowledgebaseId: 'dataset-123',
      },
    }) as any;

  beforeEach(() => {
    strategy = new FastGPTKnowledgeStrategy();
    integration = {
      options: {
        url: 'https://fastgpt.example.com/api/',
        apiKey: 'secret-key',
      },
    } as unknown as IIntegration;
    postMock.mockReset();
  });

  it('requests FastGPT with a sanitised base url and maps the response into Documents with scores', async () => {
    postMock.mockResolvedValue({
      data: {
        list: [
          {
            id: 'chunk-1',
            q: 'Question 1',
            a: 'Answer 1',
            datasetId: 'dataset-123',
            collectionId: 'collection-1',
            sourceName: 'source-name',
            sourceId: 'source-id',
            score: [
              { type: 'embedding', value: 0.42 },
              { type: 'other', value: 0.1 },
            ],
          },
        ],
        duration: '120ms',
        usingReRank: false,
        searchMode: 'embedding',
        limit: 3,
        similarity: 0,
        usingSimilarityFilter: false,
      },
    });

    const result = await strategy.execute(integration, buildPayload());

    expect(postMock).toHaveBeenCalledWith(
      'https://fastgpt.example.com/api/core/dataset/searchTest',
      {
        datasetId: 'dataset-123',
        text: 'What is FastGPT?',
        limit: 3,
        similarity: 0,
        searchMode: 'embedding',
        usingReRank: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-key',
        },
      }
    );
    expect(result.chunks).toHaveLength(1);

    const [document, score] = result.chunks[0];
    expect(document).toBeInstanceOf(Document);
    expect(document.pageContent).toBe('Question 1');
    expect(document.metadata).toEqual({
      a: 'Answer 1',
      datasetId: 'dataset-123',
      collectionId: 'collection-1',
      sourceName: 'source-name',
      sourceId: 'source-id',
    });
    expect(score).toBe(0.42);
  });

  it('defaults the similarity score to zero when FastGPT omits the embedding score', async () => {
    postMock.mockResolvedValue({
      data: {
        list: [
          {
            id: 'chunk-2',
            q: 'Question 2',
            a: 'Answer 2',
            datasetId: 'dataset-123',
            collectionId: 'collection-2',
            sourceName: 'source-name',
            sourceId: 'source-id',
            score: [],
          },
        ],
        duration: '120ms',
        usingReRank: false,
        searchMode: 'embedding',
        limit: 3,
        similarity: 0,
        usingSimilarityFilter: false,
      },
    });

    const result = await strategy.execute(integration, buildPayload());

    expect(result.chunks).toHaveLength(1);
    const [, score] = result.chunks[0];
    expect(score).toBe(0);
  });

  it('wraps FastGPT errors in InternalServerErrorException', async () => {
    postMock.mockRejectedValue(new Error('network failure'));

    await expect(strategy.execute(integration, buildPayload())).rejects.toThrow(
      InternalServerErrorException
    );

    try {
      await strategy.execute(integration, buildPayload());
    } catch (error) {
      const err = error as Error;
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.message).toBe(
        'FastGPT Knowledge Strategy Error: Failed to search FastGPT: network failure'
      );
    }
  });
});
