"""Run artifact fixtures through the final Docker sandbox HTTP shell as non-root."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--plugins', nargs='+', choices=['documents', 'pdf', 'presentations', 'spreadsheets'],
                        default=['presentations', 'documents', 'pdf'])
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    repo = Path(__file__).resolve().parent.parent
    files = {}
    for name in args.plugins:
        skill = repo/'agent-plugins'/name/'skills'/name
        for path in skill.rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts:
                files['/tmp/'+name+'/'+str(path.relative_to(skill))] = base64.b64encode(path.read_bytes()).decode()
        fixture = repo/'plugin-dev-harness'/(name+'-smoke.py')
        files['/tmp/'+name+'-smoke.py'] = base64.b64encode(fixture.read_bytes()).decode()
    cid = subprocess.check_output(['docker', 'run', '--rm', '-d', '--network', 'none', '--user', '10001:10001',
        '-e', 'HOME=/tmp', '-e', 'MPLCONFIGDIR=/tmp/matplotlib', '-v', str(root)+':/workspace', args.image], text=True).strip()
    try:
        # Send current source bytes, avoiding stale Docker Desktop source bind mounts.
        script = ('import sys,json,base64; from pathlib import Path; files=json.load(sys.stdin); '
                  '[(Path(p).parent.mkdir(parents=True,exist_ok=True),'
                  'Path(p).write_bytes(base64.b64decode(v))) for p,v in files.items()]')
        subprocess.run(['docker', 'exec', '-i', cid, 'python3', '-c', script], input=json.dumps(files),
                       text=True, check=True, capture_output=True)
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', cid, 'python3', '-c',
                "import httpx; assert httpx.get('http://127.0.0.1:8000/openapi.json').status_code == 200"], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(1)
        assert ready.returncode == 0, 'Sandbox HTTP service is not ready'
        results = []
        for name in args.plugins:
            command = (f'python3 /tmp/{name}/scripts/{name}.py run /tmp/{name}-smoke.py '
                       f'--skill /tmp/{name} --output /workspace/{name}-smoke')
            payload = {'workspace_id': '', 'command': command, 'timeout_sec': 240}
            code = ("import httpx; r=httpx.post('http://127.0.0.1:8000/shell/exec/',json=" + repr(payload) +
                    ',timeout=250); r.raise_for_status(); print(r.text)')
            result = subprocess.run(['docker', 'exec', cid, 'python3', '-c', code], capture_output=True, text=True, timeout=260)
            (root/(name+'-shell-api.log')).write_text(result.stdout+result.stderr)
            assert result.returncode == 0, name+' HTTP request failed; inspect local log'
            assert '<done> Command completed successfully' in result.stdout and '<error>' not in result.stdout, name+' shell failed; inspect local log'
            receipt = json.loads((root/(name+'-smoke')/'smoke.json').read_text())
            assert receipt['status'] == 'passed', name+' smoke failed'
            result = {'plugin': name, 'shellService': 'passed', 'checks': receipt['checks']}
            results.append(result)
            print(json.dumps(result), flush=True)
        (root/'service.json').write_text(json.dumps({'status': 'passed', 'image': args.image,
            'nonRoot': True, 'network': 'none', 'results': results}, indent=2))
    finally:
        subprocess.run(['docker', 'rm', '-f', cid], capture_output=True)


if __name__ == '__main__':
    main()
