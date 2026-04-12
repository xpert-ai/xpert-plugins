export const FILE_MEMORY_INTERNAL_RUN_TAG = 'file-memory-internal'
export const FILE_MEMORY_NOSTREAM_TAG = 'nostream'

export function createInternalRunnableConfig(runName: string) {
  return {
    runName,
    tags: [FILE_MEMORY_NOSTREAM_TAG, FILE_MEMORY_INTERNAL_RUN_TAG],
    metadata: {
      internal: true
    }
  }
}
