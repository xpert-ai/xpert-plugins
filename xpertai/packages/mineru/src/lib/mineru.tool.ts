import { tool } from '@langchain/core/tools';
import { getCurrentTaskInput } from '@langchain/langgraph';
import { getErrorMessage, XpFileSystem } from '@xpert-ai/plugin-sdk';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { MinerUClient } from './mineru.client.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { IIntegration, IKnowledgeDocument } from '@metad/contracts';
import { MinerUIntegration, MinerUIntegrationOptions } from './types.js';

/**
 * Default parsing settings for MinerU tool
 */
export interface MinerUToolDefaults {
  // Support both string enum ('true'/'false') and boolean for backward compatibility
  isOcr?: boolean | string;
  enableFormula?: boolean | string;
  enableTable?: boolean | string;
  language?: 'en' | 'ch';
  modelVersion?: 'pipeline' | 'vlm';
}

/**
 * Build MinerU PDF parser tool
 * This tool converts PDF files to markdown format using MinerU service
 */
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
        const { doc_url } = input;
        // Log raw input (mask nothing sensitive here because doc_url is public; avoid logging other fields)
        console.debug('[MinerU] tool invoked with input', { doc_url, extraKeys: Object.keys(input || {}).filter((k) => k !== 'doc_url') });

        if (!doc_url) {
          throw new Error('doc_url is required');
        }

        // Get workspace context from current task
        const currentState = getCurrentTaskInput();
        const workspacePath = currentState?.['sys']?.['volume'] ?? '/tmp/xpert';

        // Use configuration from authorization page (passed via options and defaults parameters)
        // These values come from the authorization page configuration and are set when the tool is created
        const finalApiUrl = options?.apiUrl || 'https://mineru.net/api/v4';
        const finalApiKey = options?.apiKey; // apiKey is required and validated in authorization page
        // Log effective config (mask key) to确认是否拿到了授权页的凭据
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
          },
        });
        
        // Use configuration values from authorization page (passed via defaults parameter)
        // Convert string enum values ('true'/'false') to boolean, or use boolean values directly
        // If undefined, default to true
        const finalIsOcr = defaults?.isOcr === undefined 
          ? true 
          : (typeof defaults.isOcr === 'string' ? defaults.isOcr === 'true' : defaults.isOcr === true);
        const finalEnableFormula = defaults?.enableFormula === undefined 
          ? true 
          : (typeof defaults.enableFormula === 'string' ? defaults.enableFormula === 'true' : defaults.enableFormula === true);
        const finalEnableTable = defaults?.enableTable === undefined 
          ? true 
          : (typeof defaults.enableTable === 'string' ? defaults.enableTable === 'true' : defaults.enableTable === true);
        const finalLanguage = defaults?.language || 'ch';
        const finalModelVersion = defaults?.modelVersion || 'pipeline';
        
        const effectiveOptions: MinerUIntegrationOptions = {
          apiUrl: finalApiUrl,
          apiKey: finalApiKey,
        };

        const integration: Partial<IIntegration<MinerUIntegrationOptions>> = {
          provider: MinerUIntegration,
          options: effectiveOptions,
        };

        const mineruClient = new MinerUClient(configService, {
          fileSystem,
          integration,
        });

        // Determine file name from URL
        let finalFileName = 'document.pdf';
        try {
          const parsed = new URL(doc_url);
          finalFileName = parsed.pathname.split('/').pop() || 'document.pdf';
        } catch {
          // ignore
        }

        // Create MinerU task
        const { taskId } = await mineruClient.createTask({
          url: doc_url,
          fileName: finalFileName,
          isOcr: finalIsOcr,
          enableFormula: finalEnableFormula,
          enableTable: finalEnableTable,
          language: finalLanguage,
          modelVersion: finalModelVersion,
        });

        let parsedResult: {
          id?: string;
          chunks: any[];
          metadata: any;
        };

        if (mineruClient.serverType === 'self-hosted') {
          // Self-hosted: get result immediately
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
          // Official API: wait for completion
          const result = await mineruClient.waitForTask(taskId, 5 * 60 * 1000, 5000);
          parsedResult = await resultParser.parseFromUrl(
            result.full_zip_url,
            taskId,
            {
              fileUrl: doc_url,
              name: finalFileName,
              folder: workspacePath,
            } as Partial<IKnowledgeDocument>,
            fileSystem
          );
        }

        // Build file artifacts from parsed result
        const fileArtifacts: any[] = [];
        if (parsedResult.metadata?.assets) {
          for (const asset of parsedResult.metadata.assets) {
            if (asset.type === 'file' || asset.type === 'image') {
              const fileName = asset.filePath?.split(/[/\\]/).pop() || asset.url?.split('/').pop() || 'file';
              const extension = fileName.split('.').pop()?.toLowerCase() || 'md';
              const mimeType = asset.type === 'image' 
                ? (extension === 'png' ? 'image/png' : 'image/jpeg')
                : (extension === 'md' ? 'text/markdown' : 'application/json');

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

        // Extract markdown content from chunks
        const markdownContent = parsedResult.chunks
          ?.map((chunk: any) => chunk.pageContent)
          .join('\n\n') || '';

        // Return full markdown (do NOT truncate). If the platform/UI needs a preview, it can truncate client-side.
        return [
          markdownContent,
          {
            files: fileArtifacts,
            taskId,
            metadata: parsedResult.metadata,
          },
        ];
      } catch (error) {
        throw new Error(`MinerU processing failed: ${getErrorMessage(error)}`);
      }
    },
    {
      name: 'mineru_pdf_parser',
      description:
        'Convert PDF files to markdown format using MinerU. Supports OCR, formula recognition, and table extraction. Returns markdown content and extracted files (images, JSON, etc.).',
      schema: z.object({
        doc_url: z.string().min(1).describe('PDF URL (required)'),
      }),
      responseFormat: 'content_and_artifact',
    }
  );
}

