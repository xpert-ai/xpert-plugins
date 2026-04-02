# View Image Middleware

`@xpert-ai/plugin-view-image` adds an on-demand `view_image` tool to XpertAI agents.

The tool reads image files from the sandbox workspace, keeps the loaded image batch in short-lived plugin memory, and the middleware temporarily appends those images to the immediate next model call. The data URL is not persisted into long-term chat history.

## What It Supports

- Relative sandbox paths such as `outputs/chart.png`
- Absolute paths that still point to files inside the current sandbox working directory
- Single-image and multi-image inspection via one tool call
- Multiple independent `view_image` tool calls in the same tool round
- Automatic injection into the immediate next model call after images are loaded

## What It Does Not Support In V1

- `workspace://` virtual paths
- `attachment://` paths
- Session attachment uploads
- OCR, detection, or image editing

## Agent Behavior

Once enabled, the middleware teaches the model to:

- call `view_image` before reasoning about an image file by path
- pass all needed images in one call, for example `path: ["chart.png", "diagram.png"]`
- use additional `view_image` calls in the same step when image discovery is incremental
- avoid guessing image contents that have not been loaded

When the tool succeeds, the middleware appends a temporary multimodal `HumanMessage` containing:

- a short text note
- one `image_url` block per loaded image

## Limits

- At most 3 images per tool call
- Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`
- Maximum raw file size per image: 10 MB
- Paths must stay inside the current sandbox working directory

## Validation

The validator warns when:

- sandbox is disabled for the agent
- `SandboxShell` is not present on the same agent
