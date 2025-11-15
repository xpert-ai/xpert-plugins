# zip

This library was generated with [Nx](https://nx.dev).

## Description

A TypeScript plugin for compressing multiple files into a zip file and extracting files from zip archives.

## Features

- **Zip Tool**: Compress multiple files into a single zip file
- **Unzip Tool**: Extract files from a zip archive

## Building

Run `nx build zip` to build the library.

## Running unit tests

Run `nx test zip` to execute the unit tests via [Jest](https://jestjs.io).

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
