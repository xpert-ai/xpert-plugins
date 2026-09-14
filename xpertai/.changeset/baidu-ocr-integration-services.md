---
'@xpert-ai/plugin-baidu-ocr': patch
---

Add a self-hosted PaddleOCR-VL service option to the existing Baidu OCR integration and move parsing parameters into integration settings. Connections without a service type retain the official Baidu Cloud API Key and Secret Key flow, and saved document or workflow overrides remain compatible.

Submit PDF and image bytes to the configured layout-parsing service, preserve page Markdown and scoped image assets, and keep Unlimited-OCR restricted to the official service.
