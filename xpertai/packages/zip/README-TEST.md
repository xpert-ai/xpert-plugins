# Zip Plugin Testing Guide

## Quick Test for Unzip Functionality

### Method 1: Using Test Script (Recommended)

Run the test script:

```bash
cd xpertai/packages/zip
npx tsx test-unzip.ts
```

This script will:
1. Create a zip file containing multiple files
2. Use the unzip tool to extract it
3. Verify the extraction results and file contents
4. Test MIME type recognition

### Method 2: Manual Testing

#### Step 1: Create a Test Zip File

You can use any tool to create a zip file, or use Node.js:

```javascript
import JSZip from 'jszip'
import { writeFileSync } from 'fs'

const zip = new JSZip()
zip.file('test.txt', 'Hello World')
zip.file('data.json', '{"key": "value"}')

const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync('test.zip', zipBuffer)
```

#### Step 2: Use Unzip Tool in Code

```typescript
import { buildUnzipTool } from './src/lib/unzip.tool.js'
import { readFileSync } from 'fs'

const unzipTool = buildUnzipTool()

// Read zip file
const zipBuffer = readFileSync('test.zip')
const base64Zip = zipBuffer.toString('base64')

// Extract
const result = await unzipTool.invoke({
  file: {
    name: 'test.zip',
    blob: base64Zip
  }
})

// Parse result
const data = JSON.parse(result as string)
console.log('Extracted files:', data.files)
```

### Method 3: Test in Xpert Platform

1. Build the plugin:
   ```bash
   npx nx build @xpert-ai/plugin-zip
   ```

2. Install the plugin in Xpert platform

3. Use the zip tool to create a zip file

4. Use the unzip tool to extract that file

## Test Cases

### Basic Functionality Tests

- ✅ Extract files from a zip containing multiple files
- ✅ Extract files from a zip containing subfolders
- ✅ Skip empty folders
- ✅ Identify file MIME types
- ✅ Handle base64 encoded zip files
- ✅ Handle Buffer format zip files

### Error Handling Tests

- ✅ Non-zip file error
- ✅ Empty file error
- ✅ Invalid zip file error
- ✅ Empty zip file error

## Expected Results

After successful extraction, it should return:

```json
{
  "files": [
    {
      "blob": "base64 encoded file content",
      "mime_type": "text/plain",
      "filename": "test.txt"
    }
  ]
}
```
