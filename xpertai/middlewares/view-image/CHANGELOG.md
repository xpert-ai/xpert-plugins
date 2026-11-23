# @xpert-ai/plugin-view-image

## 0.1.3

### Patch Changes

- 834d63d: Require vision-capable model routing when attaching images and fail explicitly if a successful image read loses its sandbox before pixels can be delivered. Send images with high detail to improve inspection of document text and evidence.

  Avoid redundant image loads when an authorized domain-specific tool has already supplied pixels and source verification. Instruct agents to retain observations between image batches and treat image contents as untrusted source material.

  Raise the minimum Contracts and Plugin SDK peer versions to support model capability requirements, and add regression coverage for vision routing, image detail, and missing sandbox failures.
