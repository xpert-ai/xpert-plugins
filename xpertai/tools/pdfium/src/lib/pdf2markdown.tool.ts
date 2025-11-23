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
        const { fileUrl, filePath } = input;
        let { fileName, content, scale } = input;

        if (!fileUrl && !filePath && !content) {
          throw new Error('No PDF file provided');
        }

        const currentState = getCurrentTaskInput();
        const workspacePath = currentState?.['sys']?.['volume'] ?? '/tmp/xpert';
        const baseUrl = currentState?.['sys']?.['workspace_url'];

        // Load content
        let pdfBuffer: Buffer;
        if (fileUrl) {
          const resp = await fetch(fileUrl);
          if (!resp.ok) {
            throw new Error(
              `Failed to download PDF from URL: ${resp.statusText}`
            );
          }
          const arrayBuffer = await resp.arrayBuffer();
          pdfBuffer = Buffer.from(arrayBuffer);
          if (!fileName) {
            fileName = path.basename(new URL(fileUrl).pathname);
          }
        } else if (filePath) {
          pdfBuffer = await fs.readFile(filePath);
          if (!fileName) fileName = path.basename(filePath);
        } else if (typeof content === 'string') {
          // Accept base64 string
          pdfBuffer = Buffer.from(content, 'base64');
          if (!fileName) fileName = 'document.pdf';
        } else if (content instanceof Uint8Array) {
          pdfBuffer = Buffer.from(content);
          if (!fileName) fileName = 'document.pdf';
        } else if (Buffer.isBuffer(content)) {
          pdfBuffer = content;
          if (!fileName) fileName = 'document.pdf';
        } else {
          throw new Error('Invalid PDF content format');
        }

        // Basic validation
        if (!fileName?.toLowerCase().endsWith('.pdf')) {
          // still try to treat as pdf, but append extension for output grouping
          fileName = fileName + '.pdf';
        }

        const groupName = fileName.replace(/\.pdf$/i, '') || 'pdf';
        const outputDir = path.join(workspacePath, groupName);
        await fs.mkdir(outputDir, { recursive: true });

        // Initialize pdfium
        const pdfium = await PDFiumLibrary.init();
        const pdf = await pdfium.loadDocument(pdfBuffer);
        const pageCount = pdf.getPageCount();

        let markdown =
          `# PDF Converted to Markdown\\n\\n` +
          `> Source File: ${fileName}\\n\\n` +
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

        return {
          group: groupName,
          pageCount,
          content: markdown,
          files: [markdownInfo, ...images],
        };
      } catch (e: any) {
        throw new Error('Error converting PDF: ' + (e?.message || String(e)));
      }
    },
    {
      name: 'pdf_to_markdown',
      description:
        'Convert a PDF file into a markdown file with extracted text and rendered page images. Returns markdown and images file list.',
      schema: z.object({
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
          .describe('Rendering scale for images, default 2.0'),
      }),
    }
  );
}
