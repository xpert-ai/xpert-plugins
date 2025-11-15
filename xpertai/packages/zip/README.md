# zip

This library was generated with [Nx](https://nx.dev).

## Description

A TypeScript plugin for compressing multiple files into a zip file and extracting files from zip archives.

## Features

- **Zip Tool**: Compress multiple files into a single zip file
- **Unzip Tool**: Extract files from a zip archive

## Building

Run `nx build @xpert-ai/plugin-zip` to build the library.

## Running unit tests

Run `nx test @xpert-ai/plugin-zip` to execute the unit tests via [Jest](https://jestjs.io).

## Testing

See [README-TEST.md](./README-TEST.md) for testing instructions.

## Usage

### Zip Tool

Compress multiple files into a zip file:

```typescript
{
  files: [
    { name: 'file1.txt', content: 'Content 1' },
    { name: 'file2.txt', content: 'Content 2' }
  ],
  file_name: 'archive.zip' // optional, defaults to 'files.zip'
}
```

**Parameters:**
- `files` (required): Array of files to compress
  - `name`: File name
  - `content`: File content (string, Buffer, or Uint8Array)
- `file_name` (optional): Name of the zip file, will automatically add `.zip` extension if missing

**Return value:**
```typescript
{
  blob: "base64 encoded zip file content",
  mime_type: "application/zip",
  filename: "archive.zip"
}
```

### Unzip Tool

Extract files from a zip archive:

```typescript
{
  file: {
    name: 'archive.zip',
    content: <zip file buffer or base64 string>
  }
}
```

**Parameters:**
- `file` (required): Zip file object
  - `name` or `filename`: File name (must end with `.zip`)
  - `content` or `blob`: Zip file content (Buffer, Uint8Array, or base64 string)

**Return value:**
```typescript
{
  files: [
    {
      blob: "base64 encoded file content",
      mime_type: "text/plain",
      filename: "file1.txt"
    },
    // ... more files
  ]
}
```

## Usage Examples

### Example 1: Compress Multiple Files

```typescript
import { buildZipTool } from './src/lib/zip.tool.js'

const zipTool = buildZipTool()

const result = await zipTool.invoke({
  files: [
    { name: 'readme.txt', content: 'This is a readme file' },
    { name: 'data.json', content: '{"key": "value"}' }
  ],
  file_name: 'my-archive.zip'
})

const zipData = JSON.parse(result as string)
// zipData.blob contains base64 encoded zip file
// zipData.filename is 'my-archive.zip'
```

### Example 2: Extract Zip File

```typescript
import { buildUnzipTool } from './src/lib/unzip.tool.js'
import { readFileSync } from 'fs'

const unzipTool = buildUnzipTool()

// Read zip file
const zipBuffer = readFileSync('archive.zip')
const base64Zip = zipBuffer.toString('base64')

// Extract
const result = await unzipTool.invoke({
  file: {
    name: 'archive.zip',
    blob: base64Zip
  }
})

const unzipData = JSON.parse(result as string)
// unzipData.files contains all extracted files
for (const file of unzipData.files) {
  const content = Buffer.from(file.blob, 'base64').toString('utf-8')
  console.log(`File: ${file.filename}, Content: ${content}`)
}
```

## Supported MIME Types

The Unzip tool automatically recognizes MIME types for the following file types:

- **Document Types**: `.md`, `.markdown`, `.rst`, `.tex`, `.docx`, `.xlsx`, `.pptx`
- **Code Types**: `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.sh`, `.bat`, `.ps1`
- **Image Types**: `.webp`, `.svg`, `.ico`
- **Others**: `.csv`, `.log`, `.env`, `.gitignore`, `.npmrc`, `.lock`

For unrecognized file types, the default `application/octet-stream` will be used.

## Notes

1. The Zip tool automatically skips empty file arrays or null values
2. The Unzip tool automatically skips directories and only extracts files
3. All file contents are returned as base64 encoded strings for easy JSON transmission
4. Supports nested folder structures
