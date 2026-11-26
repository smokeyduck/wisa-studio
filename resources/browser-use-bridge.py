"""WISA's private stdio adapter to the unmodified Browser Use Python package."""

import asyncio
import base64
import io
import json
import os
import sys
import re
from importlib.metadata import version
from pathlib import Path
from urllib.parse import urlsplit

# Only framed replies travel through stdout. Upstream logging stays on stderr.
output = sys.stdout
sys.stdout = sys.stderr

# The host starts this with a fresh working directory, no inherited credentials,
# PYTHONPATH pointing to the selected wheel set, and one private harness runtime.
from browser_use import Browser, harness_cloud
from browser_use.ax import AxHelpers
from browser_harness import helpers
from PIL import Image


def web_url(value):
    if value == 'about:blank':
        return value
    if not isinstance(value, str) or not value or len(value) > 8192 or any(c.isspace() for c in value):
        raise ValueError('Provide an HTTP(S) URL.')
    url = urlsplit(value)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username is not None:
        raise ValueError('Only HTTP(S) addresses without embedded credentials are supported.')
    return value


def node_id(params):
    node = params.get('element')
    if type(node) is not int or node < 1:
        raise ValueError('Provide an element ID from the current state.')
    return node


class Session:
    def __init__(self, executable):
        self.browser = Browser('chromium', executable_path=executable, headless=True, live_view=False)
        self.ax = None

    async def start(self):
        env = await self.browser.start()
        harness_cloud.route(env['BU_NAME'])
        self.ax = AxHelpers(helpers.cdp, log=lambda _: None)

    async def stop(self):
        await self.browser.stop()

    def run(self, params):
        action = params.get('action')
        if action == 'tabs':
            active = helpers.current_tab().get('targetId')
            return {'text': json.dumps([
                {'id': tab['targetId'], 'url': tab['url'][:2048], 'title': tab['title'][:256],
                 'active': active == tab['targetId']}
                for tab in helpers.list_tabs()[:32]
            ], ensure_ascii=False)}
        if action == 'open':
            url = web_url(params.get('url', 'about:blank'))
            tab = helpers.new_tab()
            helpers.activate_tab(tab)
            if url != 'about:blank':
                self.navigate(url)
        elif action in ('switch', 'close'):
            tab = params.get('tab')
            targets = [page['targetId'] for page in helpers.list_tabs()]
            if not isinstance(tab, str) or tab not in targets:
                raise ValueError('Provide a tab ID from the tabs action.')
            if action == 'close':
                if helpers.current_tab()['targetId'] == tab:
                    replacement = next((target for target in targets if target != tab), None)
                    if replacement is None:
                        helpers.activate_tab(helpers.new_tab())
                    else:
                        helpers.switch_tab(replacement, activate=True)
                helpers.close_tab(tab)
            else:
                helpers.switch_tab(tab, activate=True)
        elif action == 'navigate':
            self.navigate(web_url(params.get('url')))
        elif action == 'state':
            pass
        elif action in ('click', 'type', 'press', 'scroll', 'screenshot'):
            web_url(helpers.current_tab().get('url') or 'about:blank')
            if action == 'click':
                self.ax.click(node_id(params))
            elif action == 'type':
                text = params.get('text')
                if not isinstance(text, str) or len(text) > 16000:
                    raise ValueError('Provide text of at most 16000 characters.')
                self.ax.type(node_id(params), text)
            elif action == 'press':
                key = params.get('key')
                if key not in ('Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'):
                    raise ValueError('Unsupported key.')
                helpers.press_key(' ' if key == 'Space' else key)
            elif action == 'scroll':
                delta = params.get('delta')
                if type(delta) is not int or not -2400 <= delta <= 2400:
                    raise ValueError('Provide a scroll delta between -2400 and 2400.')
                viewport = helpers.page_info()
                helpers.scroll(viewport['w'] // 2, viewport['h'] // 2, dy=delta)
            else:
                return self.screenshot()
        else:
            raise ValueError('Unknown browser action.')
        web_url(helpers.current_tab().get('url') or 'about:blank')
        return {'text': str(self.ax.state(max=12000))[:16000]}

    @staticmethod
    def navigate(url):
        result = helpers.goto_url(url)
        if result.get('errorText'):
            raise RuntimeError(result['errorText'])

    @staticmethod
    def screenshot():
        shot = Path(helpers.capture_screenshot(max_dim=960))
        try:
            with Image.open(shot) as image, io.BytesIO() as buffer:
                image.convert('RGB').save(buffer, 'JPEG', quality=75)
                return {'text': 'Screenshot of the current tab.', 'image': base64.b64encode(buffer.getvalue()).decode('ascii')}
        finally:
            shot.unlink(missing_ok=True)


def send(reply):
    output.write(json.dumps(reply, ensure_ascii=True) + '\n')
    output.flush()


async def main():
    executable = sys.argv[1]
    check = sys.argv[2] if len(sys.argv) == 3 else None
    session = Session(executable)
    try:
        if check:
            if version('browser-use') != check:
                raise RuntimeError('Unexpected browser-use package version.')
            await session.start()
            # No external network when checking an installation. Exercise the
            # real browser, daemon, and AX APIs used by the host tool.
            helpers.goto_url('data:text/html,<title>WISA Browser Use</title>'
                             '<button onclick="this.replaceWith(document.createTextNode(\'Checked\'))">'
                             'Installation check</button>')
            button = re.search(r'\[(\d+)\] button "Installation check"', str(session.ax.state()))
            if button is None:
                raise RuntimeError('Browser Use did not return the expected accessibility state.')
            session.ax.click(int(button[1]))
            if 'Checked' not in str(session.ax.state()):
                raise RuntimeError('Browser Use did not confirm the expected page change.')
            send({'version': check})
            return
        while raw := await asyncio.to_thread(sys.stdin.buffer.readline, 262144):
            request = json.loads(raw)
            try:
                if session.ax is None:
                    await session.start()
                result = await asyncio.to_thread(session.run, request['arguments'])
                send({'id': request['id'], **result})
            except Exception as exc:
                send({'id': request['id'], 'error': str(exc)[:1024] or type(exc).__name__})
    finally:
        await session.stop()


if __name__ == '__main__':
    asyncio.run(main())
