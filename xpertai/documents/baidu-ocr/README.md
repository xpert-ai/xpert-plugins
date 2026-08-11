# Baidu OCR document transformers

`@xpert-ai/plugin-baidu-ocr` registers one reusable Baidu Cloud integration and two XpertAI document converter strategies:

- **Baidu PaddleOCR-VL** (`baidu-paddleocr-vl`) maps the official structured result into page/layout chunks and preserves tables, images, coordinates, polygons and line boxes.
- **Baidu Unlimited-OCR** (`baidu-unlimited-ocr`) consumes the official Markdown result for long-document parsing.

Both strategies use the platform's existing Integration/Credential, document task, filesystem permission, splitter and indexing pipeline. They do not create plugin-local queues or a separate document-processing path.

## Connection

Create a **Baidu OCR** system integration with a Baidu Cloud OCR application API Key and Secret Key. The secrets are declared through the Integration schema and stored by the platform credential mechanism. The same connection can be selected by either converter.

## Supported input

The plugin follows the current Baidu document parser API contract: PDF, JPG/JPEG, PNG, BMP, TIF/TIFF, OFD, DOC/DOCX, TXT, WPS and PPT/PPTX. The official API limit is 500 PDF pages per task; larger PDFs are split into bounded, sequential tasks and source page offsets are retained.

PaddleOCR-VL returns Markdown plus structured JSON. The JSON is the source for layout-aware chunks, while both original result files are archived as knowledge-scoped assets. Unlimited-OCR currently uses its stable Markdown result; any non-empty JSON result URL is archived without assuming an undocumented schema.

## Official references

- [PaddleOCR-VL API](https://cloud.baidu.com/doc/OCR/s/7mh8u7ruk)
- [Unlimited-OCR API](https://cloud.baidu.com/doc/OCR/s/fmr1p39gb)
- [Baidu Access Token](https://cloud.baidu.com/doc/AI_REFERENCE/s/um3zhy50e)
- [Baidu OCR errors](https://cloud.baidu.com/doc/OCR/s/Ak3h7y8q6)
