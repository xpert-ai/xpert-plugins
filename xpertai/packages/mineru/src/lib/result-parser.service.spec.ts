import { XpFileSystem } from '@xpert-ai/plugin-sdk';
import axios from 'axios';
import unzipper from 'unzipper';
import { MinerUResultParserService } from './result-parser.service.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock unzipper
jest.mock('unzipper');
const mockedUnzipper = unzipper as jest.Mocked<typeof unzipper>;

describe('MinerUResultParserService', () => {
  let service: MinerUResultParserService;
  let fileSystem: XpFileSystem;

  beforeAll(() => {
    service = new MinerUResultParserService();
    fileSystem = new XpFileSystem({
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: ['dist'],
    }, 'dist/data/mineru', 'http://localhost/test-folder');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse MinerU zip file and return DocumentParseResult', async () => {
    const url = 'https://example.com/test.zip';
    const taskId = 'test-task-id';
    const mockZipBuffer = Buffer.from('mock zip');

    // Mock axios.get to return the mock zip buffer
    mockedAxios.get.mockResolvedValueOnce({
      data: mockZipBuffer,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as any);

    // Mock unzipper to return mock entries
    const mockEntry = {
      path: 'full.md',
      type: 'File',
      buffer: jest.fn().mockResolvedValue(Buffer.from('# Test Content\n\nThis is test markdown content.')),
    };

    const mockDirectory = {
      files: [mockEntry],
    };

    mockedUnzipper.Open.buffer = jest.fn().mockResolvedValue(mockDirectory as any);

    const result = await service.parseFromUrl(
      url,
      taskId,
      { id: 'doc-id-123', folder: 'test-folder' },
      fileSystem
    );

    // Validate metadata
    expect(result.metadata).toBeDefined();
    expect(result.metadata.taskId).toBe(taskId);
    expect(result.metadata.parser).toBe('mineru');

    // Validate chunks
    expect(result.chunks).toBeInstanceOf(Array);
    expect(result.chunks.length).toBeGreaterThan(0);

    // Check the content of the first chunk
    const firstChunk = result.chunks[0];
    expect(firstChunk.pageContent).toBeDefined();
    expect(firstChunk.pageContent.length).toBeGreaterThan(0);
  });
});
