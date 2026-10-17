import csv
import io
import asyncio
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

request = json.loads(Path('/workspace/input/job.json').read_text())
sequence = 0

async def invoke(operation, alias, controls=None):
    global sequence
    sequence += 1
    call_id = 'call_' + str(sequence)
    print('XPERT_SANDBOX_INVOKE ' + json.dumps({'id': call_id, 'operation': operation, 'payload': {'alias': alias, 'controls': controls or {}}}), flush=True)
    deadline = time.monotonic() + 28
    while time.monotonic() < deadline:
        try:
            return json.loads(Path('/workspace/invocations/' + call_id + '.json').read_text())['value']
        except FileNotFoundError:
            await asyncio.sleep(.025)
    raise TimeoutError('Invocation timed out')

def parse_csv(text):
    records = list(csv.reader(io.StringIO(text.lstrip('\ufeff')), strict=True))
    if not records:
        return []
    headers = records.pop(0)
    if not headers or any(not key for key in headers) or len(set(headers)) != len(headers):
        raise ValueError('CSV headers must be nonempty and unique')
    if any(len(row) != len(headers) for row in records):
        raise ValueError('CSV row length does not match headers')
    return [dict(zip(headers, row)) for row in records]

async def main():
    namespace = {'__name__': 'workspace_script'}
    exec(compile(Path('/workspace/input/script').read_text(), 'workspace_script.py', 'exec'), namespace)
    query = namespace.get('query')
    if not callable(query):
        raise TypeError('Define async def query(ctx)')
    context = SimpleNamespace(csv=SimpleNamespace(parse=parse_csv), parameters=request['payload']['parameters'],
        sources=SimpleNamespace(query=lambda alias, controls=None: invoke('source.query', alias, controls)),
        files=SimpleNamespace(read=lambda alias: invoke('file.read', alias)),
        dataset=lambda rows: {'columns': [{'key': key} for key in request['payload']['outputKeys']], 'rows': rows})
    result = await query(context)
    encoded = json.dumps(result, allow_nan=False, ensure_ascii=False)
    if len(encoded.encode()) > 2000000:
        raise ValueError('Dataset output exceeds 2 MB')
    Path('/workspace/output/dataset.json').write_text(encoded)

asyncio.run(main())
