---
"@xpert-ai/plugin-mineru": patch
---

Prevent Axios from adding Content-Type or API authorization to MinerU signed file uploads. Include the transfer stage, HTTP status, remote error code, and request ID in upload and download failures without exposing signed URLs or credential headers.
