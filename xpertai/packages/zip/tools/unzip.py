from collections.abc import Generator
from typing import Any
import zipfile
import io
import mimetypes 

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

additional_mime_types = {
    # Document Type
    'md': 'text/markdown',
    'markdown': 'text/markdown',
    'rst': 'text/x-rst',
    'tex': 'application/x-tex',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    # Code Type
    'py': 'text/x-python',
    'js': 'application/javascript',
    'jsx': 'text/jsx',
    'ts': 'application/typescript',
    'tsx': 'text/tsx',
    'json': 'application/json',
    'yaml': 'application/x-yaml',
    'yml': 'application/x-yaml',
    'toml': 'application/toml',
    'ini': 'text/plain',
    'cfg': 'text/plain',
    'conf': 'text/plain',
    'sh': 'application/x-sh',
    'bat': 'application/x-bat',
    'ps1': 'application/x-powershell',
    
    # Image Type
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    
    # Others
    'csv': 'text/csv',
    'log': 'text/plain',
    'env': 'text/plain',
    'gitignore': 'text/plain',
    'npmrc': 'text/plain',
    'lock': 'text/plain',
}

class UnzipTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        zip_file = tool_parameters.get("file")

        if not zip_file.extension == ".zip":
            raise ValueError("Not a zip file provided")

        in_memory_zip_file = io.BytesIO(zip_file.blob)

        try:
            with zipfile.ZipFile(in_memory_zip_file, 'r') as zf:
                for zip_info in zf.infolist():
                    # Skip directories
                    if zip_info.is_dir():
                        continue

                    file_content = zf.read(zip_info.filename)
                    file_name = zip_info.filename
                    mime_type, _ = mimetypes.guess_type(file_name)
                    if mime_type is None:
                        ext = os.path.splitext(file_name)[1].lstrip('.').lower()
                        mime_type = additional_mime_types.get(ext, 'application/octet-stream')

                    yield self.create_blob_message(
                        blob=file_content,
                        meta={"mime_type": mime_type, "filename": file_name}
                    )
        except zipfile.BadZipFile:
            raise ValueError("Not a valid zip file provided")
        finally:
            in_memory_zip_file.close()

