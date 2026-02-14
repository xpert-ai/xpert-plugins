import { tool } from '@langchain/core/tools';
import { getCurrentTaskInput } from '@langchain/langgraph';
import { getErrorMessage, XpFileSystem } from '@xpert-ai/plugin-sdk';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { MinerUClient } from './mineru.client.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { IIntegration, IKnowledgeDocument } from '@metad/contracts';
import { MinerU, MinerUIntegrationOptions } from './types.js';

export interface MinerUToolDefaults {
  isOcr?: boolean | string;
  enableFormula?: boolean | string;
  enableTable?: boolean | string;
  language?: 'en' | 'ch';
  modelVersion?: 'pipeline' | 'vlm';
  returnJson?: boolean | string;
}

function normalizeExtraFormats(value?: string | string[] | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const formats = value.map((item) => String(item).trim()).filter(Boolean);
    return formats.length ? formats : undefined;
  }
  const formats = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return formats.length ? formats : undefined;
}

export function buildMinerUTool(
  configService: ConfigService,
  resultParser: MinerUResultParserService,
  options?: MinerUIntegrationOptions,
  fileSystem?: XpFileSystem,
  defaults?: MinerUToolDefaults
) {
  return tool(
    async (input) => {
      try {
        const { doc_url, page_ranges } = input;
        console.debug('[MinerU] tool invoked with input', {
          doc_url,
          extraKeys: Object.keys(input || {}).filter((key) => key !== 'doc_url'),
        });

        if (!doc_url) {
          throw new Error('doc_url is required');
        }

        const currentState = getCurrentTaskInput();
        const workspacePath = currentState?.['sys']?.['volume'] ?? '/tmp/xpert';

        const finalApiUrl = options?.apiUrl || 'https://mineru.net/api/v4';
        const finalApiKey = options?.apiKey;
        const maskedKey =
          finalApiKey && finalApiKey.length > 8
            ? `${finalApiKey.slice(0, 4)}***${finalApiKey.slice(-4)}`
            : finalApiKey
              ? 'provided'
              : 'missing';
        console.debug('[MinerU] buildMinerUTool config', {
          fromOptions: Boolean(options),
          apiUrl: finalApiUrl,
          apiKey: maskedKey,
          defaults: {
            isOcr: defaults?.isOcr,
            enableFormula: defaults?.enableFormula,
            enableTable: defaults?.enableTable,
            language: defaults?.language,
            modelVersion: defaults?.modelVersion,
            returnJson: defaults?.returnJson,
          },
        });

        const finalIsOcr =
          defaults?.isOcr === undefined
            ? true
            : typeof defaults.isOcr === 'string'
              ? defaults.isOcr === 'true'
              : defaults.isOcr === true;
        const finalEnableFormula =
          defaults?.enableFormula === undefined
            ? true
            : typeof defaults.enableFormula === 'string'
              ? defaults.enableFormula === 'true'
              : defaults.enableFormula === true;
        const finalEnableTable =
          defaults?.enableTable === undefined
            ? true
            : typeof defaults.enableTable === 'string'
              ? defaults.enableTable === 'true'
              : defaults.enableTable === true;
        const finalLanguage = defaults?.language || 'ch';
        const finalModelVersion = defaults?.modelVersion || 'pipeline';
        const finalExtraFormats = normalizeExtraFormats(options?.extraFormats);
        const returnJson =
          defaults?.returnJson === undefined
            ? false
            : typeof defaults.returnJson === 'string'
              ? defaults.returnJson === 'true'
              : defaults.returnJson === true;

        const effectiveOptions: MinerUIntegrationOptions = {
          apiUrl: finalApiUrl,
          apiKey: finalApiKey,
          extraFormats: finalExtraFormats,
        };

        const integration: Partial<IIntegration<MinerUIntegrationOptions>> = {
          provider: MinerU,
          options: effectiveOptions,
        };

        const mineruClient = new MinerUClient(configService, {
          fileSystem,
          integration,
        });

        let finalFileName = 'document.pdf';
        try {
          const parsed = new URL(doc_url);
          finalFileName = parsed.pathname.split('/').pop() || 'document.pdf';
        } catch {
          // Ignore URL parsing errors.
        }

        const { taskId } = await mineruClient.createTask({
          url: doc_url,
          fileName: finalFileName,
          isOcr: finalIsOcr,
          enableFormula: finalEnableFormula,
          enableTable: finalEnableTable,
          language: finalLanguage,
          modelVersion: finalModelVersion,
          pageRanges: page_ranges ?? undefined,
          extraFormats: finalExtraFormats,
        });

        let parsedResult: {
          id?: string;
          chunks: any[];
          metadata: any;
        };

        if (mineruClient.serverType === 'self-hosted') {
          const taskResult = mineruClient.getSelfHostedTask(taskId);
          if (!taskResult) {
            throw new Error('Failed to get MinerU task result');
          }

          parsedResult = await resultParser.parseLocalTask(
            taskResult,
            taskId,
            {
              fileUrl: doc_url,
              name: finalFileName,
              folder: workspacePath,
            } as Partial<IKnowledgeDocument>,
            fileSystem
          );
        } else {
          const result = await mineruClient.waitForTask(taskId, 5 * 60 * 1000, 5000);
          const fullZipUrl = result.full_zip_url;
          parsedResult = await resultParser.parseFromUrl(
            fullZipUrl,
            taskId,
            {
              fileUrl: doc_url,
              name: finalFileName,
              folder: workspacePath,
            } as Partial<IKnowledgeDocument>,
            fileSystem
          );
          if (fullZipUrl) {
            parsedResult.metadata = parsedResult.metadata ?? {};
            parsedResult.metadata.fullZipUrl = parsedResult.metadata.fullZipUrl ?? fullZipUrl;
            parsedResult.metadata.full_zip_url = parsedResult.metadata.full_zip_url ?? fullZipUrl;
          }
        }

        const fileArtifacts: any[] = [];
        if (parsedResult.metadata?.assets) {
          for (const asset of parsedResult.metadata.assets) {
            if (asset.type === 'file' || asset.type === 'image') {
              const fileName =
                asset.filePath?.split(/[/\\]/).pop() ||
                asset.url?.split('/').pop() ||
                'file';
              const extension = fileName.split('.').pop()?.toLowerCase() || 'md';
              const mimeType =
                asset.type === 'image'
                  ? extension === 'png'
                    ? 'image/png'
                    : 'image/jpeg'
                  : extension === 'md'
                    ? 'text/markdown'
                    : 'application/json';

              fileArtifacts.push({
                fileName: fileName,
                filePath: asset.filePath,
                fileUrl: asset.url,
                mimeType: mimeType,
                extension: extension,
              });
            }
          }
        }

        const markdownContent =
          parsedResult.chunks?.map((chunk: any) => chunk.pageContent).join('\n\n') || '';

        const artifact = {
          files: fileArtifacts,
          taskId,
          metadata: parsedResult.metadata,
        };

        const fullPayload = {
          output: markdownContent,
          artifact,
        };

        return [
          returnJson ? JSON.stringify(fullPayload) : markdownContent,
          artifact,
        ];
      } catch (error) {
        throw new Error(`MinerU processing failed: ${getErrorMessage(error)}`);
      }
    },
    {
      name: 'mineru_pdf_parser',
      description:
        'Convert documents to markdown using MinerU. Supports OCR, formula recognition, and table extraction. Returns markdown content and extracted files.',
      schema: z.object({
        doc_url: z.string().min(1).describe('Document URL (required)'),
        page_ranges: z
          .string()
          .optional()
          .nullable()
          .describe('Page ranges like "2,4-6" or "2--2"'),
      }),
      responseFormat: 'content_and_artifact',
    }
  );
}
