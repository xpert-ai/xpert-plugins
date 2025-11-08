import { Document } from '@langchain/core/documents';
import { IconType, IKnowledgeDocument, TDocumentAsset } from '@metad/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  ChunkMetadata,
  DocumentTransformerStrategy,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  IntegrationPermission,
} from '@xpert-ai/plugin-sdk';
import omit from 'lodash-es/omit.js';
import pick from 'lodash-es/pick.js';
import { join } from 'path';
import { PartitionParameters } from 'unstructured-client/sdk/models/shared';
import {
  icon,
  LangCodes,
  LangDescMap,
  TTransformerOptions,
  TUnstructuredResponseItem,
  Unstructured,
} from './types.js';
import { UnstructuredService } from './unstructured.service.js';


const ConfigSchemaProperties = {
  chunkingStrategy: {
    type: 'string',
    title: {
      en_US: 'Chunking Strategy',
      zh_Hans: '分块策略',
    },
    description: {
      en_US: 'The strategy to use when chunking documents into smaller pieces.',
      zh_Hans: '将文档分块为更小部分时使用的策略。',
    },
    enum: ['basic', 'by_title', 'by_page', 'by_similarity'],
    default: 'basic',
    'x-ui': {
      help: 'https://docs.unstructured.io/api-reference/partition/chunking',
    },
  },
  maxCharacters: {
    type: 'number',
    title: {
      en_US: 'Max Characters per Chunk',
      zh_Hans: '每块最大字符数',
    },
    description: {
      en_US:
        'If chunking strategy is set, cut off new sections after reaching a length of n chars (hard max). Default: 500',
      zh_Hans:
        '如果设置了分块策略，则在达到 n 个字符的长度后切断新部分（硬性最大值）。默认值：500',
    },
    default: 1000,
    'x-ui': {},
  },
  overlap: {
    type: 'number',
    title: {
      en_US: 'Chunk Overlap',
      zh_Hans: '块重叠',
    },
    description: {
      en_US:
        'Specifies the length of a string ("tail") to be drawn from each chunk and prefixed to the next chunk as a context-preserving mechanism. By default, this only applies to split-chunks where an oversized element is divided into multiple chunks by text-splitting. Default: 0',
      zh_Hans:
        '指定从每个块中提取并作为上下文保留机制前缀添加到下一个块的字符串（“尾部”）的长度。默认情况下，这仅适用于将超大元素通过文本拆分分为多个块的拆分块。默认值：0',
    },
    default: 0,
    'x-ui': {},
  },
  strategy: {
    type: 'string',
    title: {
      en_US: 'Parsing Strategy',
      zh_Hans: '解析策略',
    },
    description: {
      en_US: 'The parsing strategy to use when processing documents.',
      zh_Hans: '处理文档时使用的解析策略。',
    },
    enum: ['auto', 'fast', 'hi_res', 'ocr_only', 'vlm'],
    default: 'auto',
    'x-ui': {
      help: 'https://docs.unstructured.io/api-reference/partition/partitioning',
    },
  },
  languages: {
    type: 'array',
    title: {
      en_US: 'Languages',
      zh_Hans: '语言',
    },
    description: {
      en_US:
        'The languages present in the document, for use in partitioning and/or OCR. See the Tesseract documentation for a full list of languages.',
      zh_Hans:
        '文档中存在的语言，用于分区和/或 OCR。完整语言列表请参见 Tesseract 文档。',
    },
    enum: LangCodes,
    items: {
      type: 'string',
    },
    default: ['chi_sim', 'eng'],
    'x-ui': {
      help: 'https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html',
      enumLabels: LangDescMap,
    },
  },
};

@Injectable()
@DocumentTransformerStrategy(Unstructured)
export class UnstructuredTransformerStrategy
  implements IDocumentTransformerStrategy<any>
{
  readonly permissions = [
    {
      type: 'integration',
      service: Unstructured,
      description: 'Access to Unstructured system integrations',
    } as IntegrationPermission,
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: [],
    } as FileSystemPermission,
  ];

  meta = {
    name: Unstructured,
    label: {
      en_US: 'Unstructured',
      zh_Hans: 'Unstructured',
    },
    description: {
      en_US:
        'Designed specifically for converting multi-format documents into "LLM-friendly" structured paragraphs/elements, it is modular and oriented towards modern LLM pipelines.',
      zh_Hans:
        '专为将多格式文档转为“对 LLM 友好”结构化段落/元素而设计，模块化、面向现代 LLM 流水线。',
    },
    icon: {
      type: 'svg' as IconType,
      value: icon,
      color: '#14b8a6',
    },
    helpUrl: 'https://docs.unstructured.io/welcome',
    configSchema: {
      type: 'object',
      properties: ConfigSchemaProperties,
      required: [],
    },
  };

  @Inject(UnstructuredService)
  private readonly service: UnstructuredService;

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: TTransformerOptions
  ) {
    const fileClient = config.permissions.fileSystem;
    const integration = config.permissions.integration;
    if (!integration) {
      throw new Error('Unstructured integration is not configured');
    }
    const client = this.service.instantiateClient(integration);

    const results: Partial<IKnowledgeDocument>[] = [];
    for await (const file of files) {
      const fileContent = await fileClient.readFile(file.filePath);
      const response = await client.general.partition({
        partitionParameters: {
          files: {
            content: fileContent,
            fileName: file.filePath,
          },
          extractImageBlockTypes: ['Image', 'Table'],
          ...pick(config, Object.keys(ConfigSchemaProperties)),
        } as PartitionParameters,
      });

      // Convert to chunk Documents
      const imageAssets: TDocumentAsset[] = [];
      const chunks = await Promise.all(
        (<TUnstructuredResponseItem[]>response).map(async (item) => {
          let pageContent = item.text;
          if ('image_base64' in item.metadata) {
            // console.log('Unstructured response:', JSON.stringify(omit(item, 'metadata.image_base64'), null, 2));
            // Decode the Base64-encoded representation of the
            // processed "Image" or "Table" element into its original
            // visual representation, and then show it.
            const imageBuffer = Buffer.from(
              item.metadata['image_base64'] as string,
              'base64'
            );
            const filePath = join(
              `${file.folder || ''}/images/`,
              `${item.element_id}.png`
            );
            const url = await fileClient.writeFile(filePath, imageBuffer);
            imageAssets.push({
              type: 'image',
              url,
              filePath,
            });

            pageContent += `\n![Image](${url})`;
          }
          const doc = new Document({
            pageContent,
            metadata: {
              type: item.type,
              ...omit(item.metadata, 'image_base64'),
            },
          });

          return doc;
        })
      );

      const metadata = {
        parser: Unstructured,
        source: file.filePath,
        assets: imageAssets,
      };

      results.push({
        id: file.id,
        chunks,
        metadata,
      });
    }

    return results as IKnowledgeDocument<ChunkMetadata>[];
  }
}
