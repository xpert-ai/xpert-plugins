import { buildPdfToMarkdownTool } from './pdf2markdown.tool.js';
import path from 'path';
import fs from 'fs/promises';

// Mock getCurrentTaskInput
jest.mock('@langchain/langgraph', () => {
  const path = require('path');
  return {
    getCurrentTaskInput: jest.fn().mockReturnValue({
      sys: {
        volume: path.join(process.cwd(), 'tmp/test-workspace'),
        workspace_url: 'http://localhost:3000/files',
      },
    }),
  };
});

describe('pdfium', () => {
  const fixturePath = path.join(
    process.cwd(),
    '__fixtures__/一加 Ace 5 Pro_入门指南_CN.pdf'
  );

  it('should convert PDF to markdown and images', async () => {
    const tool = buildPdfToMarkdownTool();

    // Ensure fixture exists
    try {
      await fs.access(fixturePath);
    } catch (e) {
      console.warn(`Fixture not found at ${fixturePath}, skipping test`);
      return;
    }

    const parsed = await tool.invoke({
      filePath: fixturePath,
    });

    expect(parsed).toHaveProperty('pageCount');
    expect(parsed).toHaveProperty('content');
    expect(parsed).toHaveProperty('files');
    expect(parsed.pageCount).toBeGreaterThan(0);
    expect(parsed.files.length).toBe(parsed.pageCount + 1);
    expect(parsed.files[0].fileName).toMatch(/\.md$/);

    console.log('Conversion result:', parsed);
  }, 60000); // Increase timeout for PDF processing
});
