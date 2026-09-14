"""Verify real HTTP/module loading, persistence and all three demo entry points."""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import quote
from playwright.sync_api import sync_playwright
import argparse
import json
import os

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def site_url(remote):
    if remote:
        yield remote.rstrip('/') + '/'
        return
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT.parent))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/{quote(ROOT.name)}/'
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Published Pages URL; otherwise serve this checkout locally')
    parser.add_argument('--report', default='test-results/site-results.json')
    args = parser.parse_args()
    checks = []
    with site_url(args.url) as url, sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or p.chromium.executable_path,
            headless=True, args=['--no-sandbox'])
        browser_version = browser.version
        try:
            for entry in ['', 'standalone.html', 'sample/minimal.html']:
                context = browser.new_context(viewport={'width': 1600, 'height': 1040})
                page = context.new_page()
                page.set_default_timeout(15000)
                errors, failures = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('response', lambda response: failures.append(response.url) if response.status >= 400 and not response.url.endswith('/favicon.ico') else None)
                try:
                    response = page.goto(url + entry, wait_until='networkidle')
                    assert response and response.ok, f'Failed to load {entry or "index.html"}'
                    if entry == 'sample/minimal.html':
                        page.wait_for_function('!!document.querySelector("avalon-dock").manager')
                        field = page.get_by_role('textbox', name='Minimal editor')
                        field.fill('Published reusable component')
                        page.get_by_role('button', name='Float editor', exact=True).click()
                        page.wait_for_function('document.querySelector("avalon-dock").manager.Find("editor").IsFloating')
                        page.get_by_role('button', name='Dock editor', exact=True).click()
                        page.wait_for_function('!document.querySelector("avalon-dock").manager.Find("editor").IsFloating')
                        assert field.input_value() == 'Published reusable component'
                    else:
                        page.wait_for_function('!!window.demo')
                        assert page.evaluate('demo.AD.validateLayout(demo.manager.Layout).contents') == 14
                        page.get_by_text('Everything in its place.', exact=True).wait_for()
                        if not entry and not args.url:
                            images = ROOT / 'docs' / 'images'
                            images.mkdir(parents=True, exist_ok=True)
                            page.screenshot(path=str(images / 'dockyard.png'))
                            page.evaluate('demo.manager.Float(demo.manager.Find("properties"), {FloatingLeft:830,FloatingTop:105,FloatingWidth:320,FloatingHeight:470})')
                            page.locator('.ad-floating').wait_for()
                            page.screenshot(path=str(images / 'floating.png'))
                        page.locator('.ad-tab[data-tab-id="workspace.js"]:visible').click()
                        field = page.get_by_role('textbox', name='Editor workspace.js', exact=True)
                        field.fill('// HTTP-origin persistence verified')
                        field.press('Control+s')
                        assert page.evaluate('demo.manager.SaveToStorage()')
                        page.reload(wait_until='networkidle')
                        page.wait_for_function('!!window.demo')
                        page.locator('.ad-tab[data-tab-id="workspace.js"]:visible').click()
                        assert page.get_by_role('textbox', name='Editor workspace.js', exact=True).input_value() == '// HTTP-origin persistence verified'
                        assert page.evaluate('demo.AD.validateLayout(demo.manager.Layout).contents') == 14
                    assert not errors, f'Browser errors: {errors}'
                    assert not failures, f'Failed assets: {failures}'
                    checks.append({'entry': entry or 'index.html', 'passed': True, 'errors': errors, 'failedAssets': failures})
                    print(f'PASS HTTP browser: {url}{entry}', flush=True)
                finally:
                    context.close()
        finally:
            browser.close()
    report = {'url': url, 'browser': browser_version, 'passed': len(checks), 'checks': checks}
    path = ROOT / args.report
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
