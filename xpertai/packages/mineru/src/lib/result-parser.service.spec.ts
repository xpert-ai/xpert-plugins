import { XpFileSystem } from '@xpert-ai/plugin-sdk';
import { MinerUResultParserService } from './result-parser.service.js';

describe('MinerUResultParserService', () => {
  let service: MinerUResultParserService;
  let fileSystem: XpFileSystem

  beforeAll(() => {
    service = new MinerUResultParserService();
    fileSystem = new XpFileSystem({
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: ['dist'],
    }, 'dist/data/mineru', 'http://localhost/test-folder');
  });

  it(
    'should parse MinerU zip file and return DocumentParseResult',
    async () => {
      const url =
        'https://cdn-mineru.openxlab.org.cn/pdf/2025-09-18/a5fd82f0-3612-45f9-bb5e-5f87ed53bf57.zip';
      const taskId = 'a5fd82f0-3612-45f9-bb5e-5f87ed53bf57';

      const result = await service.parseFromUrl(url, taskId, {id: 'doc-id-123', folder: 'test-folder'}, fileSystem);

      // Validate metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata.taskId).toBe(taskId);
      expect(result.metadata.assets).toBeDefined();
      expect(result.metadata.mineruBackend).toBeDefined();
      expect(result.metadata.mineruVersion).toBeDefined();

      // Validate chunks
      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks.length).toBeGreaterThan(0);

      // Check the content of the first chunk
      const firstChunk = result.chunks[0];
      expect(firstChunk.pageContent).toBeDefined();
      expect(firstChunk.pageContent.length).toBeGreaterThan(0);
    },
    // Give axios enough time to download the zip
  );
});
