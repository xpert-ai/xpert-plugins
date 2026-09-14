---
"@xpert-ai/plugin-mineru": patch
"@xpert-ai/plugin-baidu-ocr": patch
---

Enable MinerU and Baidu PaddleOCR-VL to participate in knowledgebase parser selection by declaring supported file formats and image-text extraction capabilities. Validate parser options and integration credentials before processing so configuration errors are reported without silently changing parsers.

Limit Baidu PaddleOCR-VL knowledgebase parser choices to PDF and supported image formats. Word, PowerPoint, text, and other formats remain with their built-in or other plugin parsers.
