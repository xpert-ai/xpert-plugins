#!/usr/bin/env python3
"""Portable Presentations CLI using the administrator-installed open-source runtime."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import zipfile

sys.dont_write_bytecode = True


def runtime():
    return Path(os.environ.get('XPERT_PRESENTATIONS_RUNTIME', Path.home() / '.local/share/xpert/presentations'))


def prepare():
    explicit = os.environ.get('XPERT_PRESENTATIONS_PYTHON')
    python = Path(explicit) if explicit else runtime() / 'venv/bin/python'
    if python.is_file() and os.path.abspath(python) != os.path.abspath(sys.executable):
        os.execv(str(python), [str(python), '-B', str(Path(__file__).resolve()), *sys.argv[1:]])
    if explicit and not python.is_file():
        raise RuntimeError('XPERT_PRESENTATIONS_PYTHON is not an installed interpreter')
    missing = [name for name in ['pptx', 'lxml', 'PIL', 'pypdfium2'] if importlib.util.find_spec(name) is None]
    if missing:
        raise RuntimeError('Missing packages: ' + ', '.join(missing) + '; administrator: node tools/presentations-runtime/install.mjs')


def soffice():
    candidates = [os.environ.get('XPERT_PRESENTATIONS_SOFFICE'),
                  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
                  str(Path.home() / 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
                  shutil.which('soffice')]
    found = next((path for path in candidates if path and Path(path).is_file()), None)
    if not found:
        raise RuntimeError('Install LibreOffice including Impress or set XPERT_PRESENTATIONS_SOFFICE')
    return found


def node(*args):
    executable = os.environ.get('XPERT_PRESENTATIONS_NODE') or shutil.which('node')
    if not executable:
        raise RuntimeError('Install Node.js >=22 or set XPERT_PRESENTATIONS_NODE')
    result = subprocess.run([executable, str(Path(__file__).with_name('build-deck.mjs')), *map(str, args)],
                            capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:] or 'Node authoring failed')
    return json.loads(result.stdout)


def main():
    prepare()
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    commands.add_parser('doctor')
    build = commands.add_parser('build')
    build.add_argument('spec', type=Path)
    build.add_argument('--output', required=True, type=Path)
    inspect = commands.add_parser('inspect')
    inspect.add_argument('input', type=Path)
    render = commands.add_parser('render')
    render.add_argument('input', type=Path)
    render.add_argument('--output', required=True, type=Path)
    render.add_argument('--dpi', type=int, default=120)
    edit = commands.add_parser('replace-text')
    edit.add_argument('input', type=Path)
    edit.add_argument('--output', required=True, type=Path)
    edit.add_argument('--slide', required=True, type=int)
    edit.add_argument('--shape-id', required=True, type=int)
    edit.add_argument('--old', required=True)
    edit.add_argument('--new', required=True)
    edit.add_argument('--expected-sha256', required=True)
    run = commands.add_parser('run')
    run.add_argument('script', type=Path)
    run.add_argument('arguments', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    from pptx_package import inspect_deck, new_output, replace_text, normalize_generated_ids
    if args.action == 'doctor':
        from importlib.metadata import version
        executable = soffice()
        result = {**node('--doctor'), 'python': sys.executable, 'soffice': executable,
                  'libreoffice': subprocess.check_output([executable, '--version'], text=True, timeout=20).strip(),
                  'requiredFont': 'Noto Sans CJK SC (verify glyphs in rendered slides)',
                  'packages': {key: version(key) for key in ['python-pptx', 'lxml', 'Pillow', 'pypdfium2']}}
    elif args.action == 'build':
        output = new_output(None, args.output)
        node(args.spec.resolve(), output)
        try:
            normalize_generated_ids(output)
            result = inspect_deck(output)
        except Exception:
            output.unlink()
            raise
    elif args.action == 'inspect':
        result = inspect_deck(args.input)
    elif args.action == 'render':
        from pptx_render import render_deck
        result = render_deck(args.input, args.output, soffice(), args.dpi)
    elif args.action == 'replace-text':
        result = replace_text(args.input, args.output, args.slide, args.shape_id, args.old, args.new, args.expected_sha256)
    else:
        script = str(args.script.resolve())
        sys.argv = [script, *args.arguments]
        sys.path.insert(0, str(Path(script).parent))
        runpy.run_path(script, run_name='__main__')
        return
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError, KeyError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
