"""Launch the administrator-installed spreadsheet npm runtime without network installs."""
import os
from pathlib import Path
import shutil
import sys


def main():
    root = Path(os.environ.get('XPERT_SPREADSHEETS_RUNTIME',
                              str(Path.home()/'.local/share/xpert/spreadsheets/runtime')))
    node = os.environ.get('XPERT_SPREADSHEETS_NODE') or shutil.which('node')
    python = os.environ.get('XPERT_SPREADSHEETS_PYTHON') or str(root/'venv'/'bin'/'python')
    cli = root/'node_modules/@xpert-ai/artifact-tool/src/cli.mjs'
    if not node or not cli.is_file() or not Path(python).is_file():
        raise RuntimeError('Spreadsheets runtime missing. Administrator: run node tools/spreadsheets-runtime/install.mjs and install LibreOffice Calc/CJK fonts.')
    os.environ['XPERT_SPREADSHEETS_PYTHON'] = python
    if len(sys.argv) > 1 and sys.argv[1] == 'run':
        if len(sys.argv) < 3:
            raise ValueError('run requires a local test script')
        os.execv(python, [python, *sys.argv[2:]])
    os.execv(node, [node, str(cli), *sys.argv[1:]])


if __name__ == '__main__':
    main()
