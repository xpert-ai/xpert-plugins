#!/usr/bin/env python3
"""Xpert PDF CLI. Use the administrator-installed environment; never install in a run."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import runpy
import sys

sys.dont_write_bytecode = True


def select_python():
    explicit = os.environ.get('XPERT_PDF_PYTHON')
    python = Path(explicit) if explicit else Path.home() / '.local/share/xpert/pdf/venv/bin/python'
    if python.is_file() and os.path.abspath(python) != os.path.abspath(sys.executable):
        os.execv(str(python), [str(python), '-B', str(Path(__file__).resolve()), *sys.argv[1:]])
    if explicit and not python.is_file():
        raise RuntimeError('XPERT_PDF_PYTHON does not point to an installed interpreter')
    missing = [name for name in ['reportlab', 'pypdf', 'pdfplumber', 'pypdfium2', 'PIL']
               if importlib.util.find_spec(name) is None]
    if missing:
        raise RuntimeError('Missing packages: ' + ', '.join(missing) + '; administrator: run node tools/pdf-runtime/install.mjs')


def main():
    select_python()
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    commands.add_parser('doctor')
    run = commands.add_parser('run')
    run.add_argument('script')
    run.add_argument('arguments', nargs=argparse.REMAINDER)
    inspect = commands.add_parser('inspect')
    inspect.add_argument('input', type=Path)
    inspect.add_argument('--pages')
    inspect.add_argument('--tables', action='store_true')
    render = commands.add_parser('render')
    render.add_argument('input', type=Path)
    render.add_argument('--output', type=Path, required=True)
    render.add_argument('--pages')
    render.add_argument('--dpi', type=int, default=120)
    merge = commands.add_parser('merge')
    merge.add_argument('inputs', nargs='+', type=Path)
    merge.add_argument('--output', type=Path, required=True)
    select = commands.add_parser('select')
    select.add_argument('input', type=Path)
    select.add_argument('--pages', required=True)
    select.add_argument('--output', type=Path, required=True)
    fill = commands.add_parser('fill')
    fill.add_argument('input', type=Path)
    fill.add_argument('--values', type=Path, required=True)
    fill.add_argument('--output', type=Path, required=True)
    fill.add_argument('--flatten', action='store_true')
    args = parser.parse_args()
    if args.action == 'run':
        script = str(Path(args.script).resolve())
        sys.argv = [script, *args.arguments]
        sys.path.insert(0, str(Path(script).parent))
        runpy.run_path(script, run_name='__main__')
        return
    if args.action == 'doctor':
        from importlib.metadata import version
        from pdf_fonts import font_path, register_font
        result = {'python': sys.executable, 'font': str(font_path()), 'registeredFont': register_font(),
                  'packages': {name: version(name) for name in ['reportlab', 'pypdf', 'pdfplumber', 'pypdfium2', 'Pillow']}}
    elif args.action == 'render':
        from pdf_render import render_pdf
        result = render_pdf(args.input, args.output, args.pages, args.dpi)
    elif args.action == 'fill':
        from pdf_forms import fill_form
        result = fill_form(args.input, args.values, args.output, args.flatten)
    else:
        from pdf_operations import operate
        result = operate(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
