import { PDFiumLibrary } from '@hyzyla/pdfium';
import { tool } from '@langchain/core/tools';
import { getCurrentTaskInput } from '@langchain/langgraph';
import fs from 'fs/promises';
import path from 'path';
import { PNG } from 'pngjs';
import { z } from 'zod';

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md':
      return 'text/markdown';
    case 'png':
      return 'image/png';
    case 'txt':
      return 'text/plain';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export function buildPdfToMarkdownTool() {
  return tool(
    async (input) => {
      try {
        const { content, scale } = input;
        let { file } = input;

        if (!file && !input.fileUrl && !input.filePath && !input.content) {
          throw new Error('No PDF file provided');
        }
        if (!file) {
          file = {
            fileName: input.fileName,
            fileUrl: input.fileUrl,
            filePath: input.filePath
          }
        }
        const files = Array.isArray(file) ? file : [file];

        // Workspace paths
        const currentState = getCurrentTaskInput();
        const workspacePath = currentState?.['sys']?.['volume'] ?? '/tmp/xpert';
        const baseUrl = currentState?.['sys']?.['workspace_url'];

        let markdown = ''
        const fileArtifacts: any[] = [];
        for await (const file of files) {
          // Load content
          let pdfBuffer: Buffer;
          if (file.fileUrl) {
            const resp = await fetch(file.fileUrl);
            if (!resp.ok) {
              throw new Error(
                `Failed to download PDF from URL: ${resp.statusText}`
              );
            }
            const arrayBuffer = await resp.arrayBuffer();
            pdfBuffer = Buffer.from(arrayBuffer);
            if (!file.fileName) {
              file.fileName = path.basename(new URL(file.fileUrl).pathname);
            }
          } else if (file.filePath) {
            pdfBuffer = await fs.readFile(file.filePath);
            if (!file.fileName) file.fileName = path.basename(file.filePath);
          } else if (typeof content === 'string') {
            // Accept base64 string
            pdfBuffer = Buffer.from(content, 'base64');
            if (!file.fileName) file.fileName = 'document.pdf';
          } else if (content instanceof Uint8Array) {
            pdfBuffer = Buffer.from(content);
            if (!file.fileName) file.fileName = 'document.pdf';
          } else if (Buffer.isBuffer(content)) {
            pdfBuffer = content;
            if (!file.fileName) file.fileName = 'document.pdf';
          } else {
            throw new Error('Invalid PDF content format');
          }

          // Basic validation
          if (!file.fileName?.toLowerCase().endsWith('.pdf')) {
            // still try to treat as pdf, but append extension for output grouping
            file.fileName = file.fileName + '.pdf';
          }

          const groupName = file.fileName.replace(/\.pdf$/i, '') || 'pdf';
          const outputDir = path.join(workspacePath, groupName);
          await fs.mkdir(outputDir, { recursive: true });

          // Initialize pdfium
          const pdfium = await PDFiumLibrary.init();
          const pdf = await pdfium.loadDocument(pdfBuffer);
          const pageCount = pdf.getPageCount();

          markdown +=
            `# PDF Converted to Markdown\\n\\n` +
            `> Source File: ${file.fileName}\\n\\n` +
            `> Pages: ${pageCount}\\n\\n`;

          const images: {
            fileName: string;
            filePath: string;
            fileUrl?: string;
            mimeType: string;
            page: number;
          }[] = [];

          const renderScale =
            typeof scale === 'number' && scale > 0 ? scale : 2.0;

          for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const text = page.getText()?.trim() ?? '';
            const bmp = await page.render({
              scale: renderScale,
              render: 'bitmap',
            });

            const png = new PNG({
              width: bmp.width,
              height: bmp.height,
            });
            png.data = Buffer.from(bmp.data);
            const pngBuffer = PNG.sync.write(png);

            const imgFileName = `page-${i + 1}.png`;
            const imgFullPath = path.join(outputDir, imgFileName);
            await fs.writeFile(imgFullPath, pngBuffer);

            markdown += `## Page ${i + 1}\\n\\n`;
            markdown += `![Page ${i + 1}](${imgFileName})\\n\\n`;
            if (text.length > 0) {
              markdown += `### Extracted Text\\n\\n`;
              // Preserve line breaks
              markdown += text + '\\n\\n';
            } else {
              markdown += `> (No extractable text, maybe scanned page)\\n\\n`;
            }

            images.push({
              fileName: path.join(groupName, imgFileName),
              filePath: imgFullPath,
              fileUrl: baseUrl
                ? new URL(groupName + '/' + imgFileName, baseUrl).href
                : undefined,
              mimeType: 'image/png',
              page: i + 1,
            });
          }

          pdf.destroy();
          pdfium.destroy();

          const mdFileName = 'result.md';
          const mdFullPath = path.join(outputDir, mdFileName);
          await fs.writeFile(mdFullPath, markdown, 'utf8');

          const markdownInfo = {
            fileName: path.join(groupName, mdFileName),
            filePath: mdFullPath,
            fileUrl: baseUrl
              ? new URL(groupName + '/' + mdFileName, baseUrl).href
              : undefined,
            mimeType: getMimeType(mdFileName),
          };

          fileArtifacts.push(markdownInfo)
          fileArtifacts.push(...images);
        }

        return [
          markdown,
          {
            files: fileArtifacts
          },
        ];
      } catch (e: any) {
        throw new Error('Error converting PDF: ' + (e?.message || String(e)));
      }
    },
    {
      name: 'pdf_to_markdown',
      description:
        'Convert a PDF file into a markdown file with extracted text and rendered page images. Returns markdown and images file list.',
      schema: z.object({
        file: z.any().optional().nullable().describe('File object or list of File objects'),
        fileName: z.string().optional().nullable(),
        filePath: z.string().optional().nullable(),
        fileUrl: z.string().optional().nullable(),
        content: z
          .union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)])
          .optional()
          .nullable(),
        scale: z
          .number()
          .optional()
          .nullable()
          .describe('Rendering scale for images, default 2.0'),
      }),
      responseFormat: 'content_and_artifact',
    }
  );
}
