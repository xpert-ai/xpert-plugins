#!/usr/bin/env python3
"""Xpert DOCX launcher. Uses administrator-installed dependencies; never installs."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import runpy
import shutil
import sys

sys.dont_write_bytecode = True


def select_python():
    explicit = os.environ.get('XPERT_DOCUMENTS_PYTHON')
    local = Path.home() / '.local/share/xpert/documents/venv/bin/python'
    selected = Path(explicit) if explicit else local
    # Compare executable paths, not resolved symlinks: venvs share a base binary.
    if selected.is_file() and os.path.abspath(selected) != os.path.abspath(sys.executable):
        os.execv(str(selected), [str(selected), '-B', str(Path(__file__).resolve()), *sys.argv[1:]])
    if explicit and not selected.is_file():
        raise RuntimeError('XPERT_DOCUMENTS_PYTHON does not point to an installed interpreter')
    missing = [name for name in ['docx', 'lxml', 'PIL', 'pypdfium2'] if importlib.util.find_spec(name) is None]
    if missing:
        raise RuntimeError('Missing packages: ' + ', '.join(missing) + '. Administrator: run node tools/documents-runtime/install.mjs in Xpert.')


def soffice():
    explicit = os.environ.get('XPERT_DOCUMENTS_SOFFICE')
    if explicit:
        candidates = [explicit]
    else:
        candidates = [
            '/Applications/LibreOffice.app/Contents/MacOS/soffice',
            str(Path.home() / 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
            shutil.which('soffice'), shutil.which('libreoffice')]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return str(Path(candidate).absolute())
    raise RuntimeError('LibreOffice Writer is missing. Install it or set XPERT_DOCUMENTS_SOFFICE to its executable.')


def main():
    select_python()
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    commands.add_parser('doctor')
    runner = commands.add_parser('run')
    runner.add_argument('script')
    runner.add_argument('arguments', nargs=argparse.REMAINDER)
    render = commands.add_parser('render')
    render.add_argument('input', type=Path)
    render.add_argument('--output', type=Path, required=True)
    render.add_argument('--dpi', type=int, default=120, choices=range(72, 201))
    inspect = commands.add_parser('inspect')
    inspect.add_argument('input', type=Path)
    for action in ['comment', 'replace']:
        command = commands.add_parser(action)
        command.add_argument('input', type=Path)
        command.add_argument('--output', type=Path, required=True)
        command.add_argument('--author', required=True)
        if action == 'comment':
            command.add_argument('--paragraph', type=int, required=True)
            command.add_argument('--text', required=True)
        else:
            command.add_argument('--old', required=True)
            command.add_argument('--new', required=True)
    args = parser.parse_args()
    if args.action == 'run':
        script = str(Path(args.script).resolve())
        sys.argv = [script, *args.arguments]
        sys.path.insert(0, str(Path(script).parent))
        runpy.run_path(script, run_name='__main__')
        return
    if args.action == 'doctor':
        from importlib.metadata import version
        result = {'python': sys.executable, 'soffice': soffice(), 'packages': {
            name: version(name) for name in ['python-docx', 'lxml', 'Pillow', 'pypdfium2']}}
    elif args.action == 'render':
        from rendering import render_document
        result = render_document(args.input, args.output, soffice(), args.dpi)
    else:
        from review import operate
        result = operate(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
