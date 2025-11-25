
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

    const message = await tool.invoke({
      id: '123',
      name: 'pdf_to_markdown',
      type: 'tool_call',
      args: {
        filePath: fixturePath,
      }
    });

    console.log(message)
    const parsed = message.artifact

    expect(message.tool_call_id).toEqual('123')
    expect(parsed).toHaveProperty('files');
    expect(parsed.files[0].fileName).toMatch(/\.md$/);
  }, 60000); // Increase timeout for PDF processing

  it('should convert PDF Object to markdown and images', async () => {
    const tool = buildPdfToMarkdownTool();

    // Ensure fixture exists
    try {
      await fs.access(fixturePath);
    } catch (e) {
      console.warn(`Fixture not found at ${fixturePath}, skipping test`);
      return;
    }

    const message = await tool.invoke({
      id: '123',
      name: 'pdf_to_markdown',
      type: 'tool_call',
      args: {
        file: {
          filePath: fixturePath,
        }
      }
    });

    console.log(message)
    const parsed = message.artifact

    expect(message.tool_call_id).toEqual('123')
    expect(parsed).toHaveProperty('files');
    expect(parsed.files[0].fileName).toMatch(/\.md$/);

    const message2 = await tool.invoke({
      id: '123',
      name: 'pdf_to_markdown',
      type: 'tool_call',
      args: {
        file: [{
          filePath: fixturePath,
        }]
      }
    });

    console.log(message2)
    const parsed2 = message2.artifact

    expect(message2.tool_call_id).toEqual('123')
    expect(parsed2).toHaveProperty('files');
  }, 60000); // Increase timeout for PDF processing
});
