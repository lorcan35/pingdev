import json
import time
import urllib.request

from .client import GatewayClient


class Tab:
    """Represents a single browser tab connected via PingOS."""

    def __init__(self, client, device_id, title=None, url=None):
        self.client = client
        self.device_id = device_id
        self.title = title
        self.url = url

    def __repr__(self):
        if self.title:
            return f'Tab({self.device_id} "{self.title}")'
        return f'Tab({self.device_id})'

    def _op(self, op, **kwargs):
        """Run an operation on this tab via the gateway."""
        body = kwargs if kwargs else None
        return self.client._request('POST', f'/v1/dev/{self.device_id}/{op}', body=body)

    def recon(self):
        """Get page structure and interactive elements."""
        return self._op('recon')

    def act(self, instruction):
        """Execute a natural-language instruction."""
        return self._op('act', instruction=instruction)

    def extract(self, schema):
        """Extract structured data using a schema dict."""
        return self._op('extract', schema=schema)

    def click(self, selector):
        """Click an element by CSS selector."""
        return self._op('click', selector=selector)

    def type(self, text, selector=None):
        """Type text, optionally into a specific element."""
        return self._op('type', text=text, selector=selector)

    def press(self, key):
        """Press a keyboard key (e.g. 'Enter', 'Tab')."""
        return self._op('press', key=key)

    def scroll(self, direction='down', amount=3):
        """Scroll the page."""
        return self._op('scroll', direction=direction, amount=amount)

    def observe(self):
        """Get a human-readable list of possible actions on the page."""
        return self._op('observe')

    def read(self, selector):
        """Read text content of an element. Returns str or list[str]."""
        result = self._op('read', selector=selector)
        # Handle both single and multi-element responses
        if isinstance(result, dict) and 'result' in result:
            return result['result']
        return result

    def wait(self, seconds):
        """Wait for the given number of seconds."""
        time.sleep(seconds)
        return self

    def screenshot(self):
        """Take a screenshot of the tab."""
        return self._op('screenshot')

    def eval(self, expression):
        """Evaluate a JavaScript expression in the tab."""
        return self._op('eval', expression=expression)

    def discover(self):
        """Auto-detect page type and generate extraction schemas.

        Uses heuristics to classify the page (product, search, article, etc.)
        and returns suggested extraction schemas. No LLM calls needed.

        Returns:
            dict with 'pageType', 'confidence', 'schemas', etc.
        """
        resp = self.client._request('GET', f'/v1/dev/{self.device_id}/discover')
        if isinstance(resp, dict) and 'result' in resp:
            return resp['result']
        return resp

    def suggest(self, question, context=None):
        """Get an LLM suggestion for this tab.

        Args:
            question: The question to ask.
            context: Optional page context string.

        Returns:
            dict with 'suggestion' and 'confidence' keys.
        """
        body = {'question': question}
        if context is not None:
            body['context'] = context
        return self.client._request('POST', f'/v1/dev/{self.device_id}/suggest', body=body)

    def record_start(self):
        """Start recording user interactions on this tab."""
        return self.client._request('POST', '/v1/record/start', body={'device': self.device_id})

    def record_stop(self):
        """Stop recording user interactions on this tab."""
        return self.client._request('POST', '/v1/record/stop', body={'device': self.device_id})

    def export_recording(self, name='recording'):
        """Export the recorded workflow as PingApp JSON.

        Args:
            name: Name for the exported workflow.

        Returns:
            dict with the workflow definition.
        """
        return self.client._request('POST', '/v1/record/export', body={'device': self.device_id, 'name': name})

    def replay(self, recording, speed=0, timeout=10000):
        """Replay a recorded action sequence on this tab.

        Args:
            recording: Recording dict with 'id', 'url', 'actions'.
            speed: Replay speed multiplier (0 = instant, 1.0 = real-time).
            timeout: Per-action timeout in ms.

        Returns:
            ReplayResult dict with step outcomes.
        """
        body = {
            'device': self.device_id,
            'recording': recording,
            'speed': speed,
            'timeout': timeout,
        }
        resp = self.client._request('POST', '/v1/recordings/replay', body=body)
        if isinstance(resp, dict) and 'result' in resp:
            return resp['result']
        return resp

    def generate_pingapp(self, recording, name=None):
        """Generate a PingApp definition from a recording.

        Args:
            recording: Recording dict with 'id', 'url', 'actions'.
            name: Optional name for the generated app.

        Returns:
            dict with 'app' (manifest, workflow, selectors, test) and 'files'.
        """
        body = {'recording': recording}
        if name:
            body['name'] = name
        resp = self.client._request('POST', '/v1/recordings/generate', body=body)
        if isinstance(resp, dict) and 'app' in resp:
            return resp
        return resp

    def query(self, question):
        """Natural language query about the page.

        Args:
            question: The question to ask about the page content.

        Returns:
            dict with 'answer', 'selector', 'cached', and optionally 'model'.
        """
        return self._op('query', question=question)

    def watch(self, selector, fields=None, interval=5000):
        """Subscribe to live data changes via SSE. Yields WatchEvent dicts.

        Starts a watch on the gateway and connects to the SSE stream.
        Use `unwatch(watch_id)` to stop.

        Args:
            selector: CSS selector of the element to monitor.
            fields: Optional dict mapping field names to sub-selectors.
            interval: Polling interval in milliseconds (default 5000).

        Yields:
            dict with 'watchId', 'timestamp', 'changes', 'snapshot'.
        """
        body = {'selector': selector, 'interval': interval}
        if fields:
            body['fields'] = fields
        resp = self.client._request(
            'POST',
            f'/v1/dev/{self.device_id}/watch/start',
            body=body,
        )
        watch_id = resp.get('watchId') if isinstance(resp, dict) else None
        if not watch_id:
            raise RuntimeError('Failed to start watch: no watchId returned')

        # Connect to SSE stream
        stream_url = f'{self.client.base_url}/v1/watches/{watch_id}/events'
        req = urllib.request.Request(stream_url, method='GET')
        sse_resp = urllib.request.urlopen(req)
        for raw_line in sse_resp:
            line = raw_line.decode('utf-8').strip()
            if line.startswith('data: '):
                yield json.loads(line[6:])

    def unwatch(self, watch_id):
        """Stop a specific watch by its ID.

        Args:
            watch_id: The watch ID returned from watch().

        Returns:
            dict confirmation.
        """
        return self.client._request('DELETE', f'/v1/watches/{watch_id}')

    def diff(self, schema):
        """Extract data and compare with previous extraction.

        Args:
            schema: Mapping of field names to CSS selectors.

        Returns:
            dict with 'changes', 'unchanged', 'snapshot', 'previousSnapshot',
            and 'isFirstExtraction'.
        """
        return self._op('diff', schema=schema)

    # ------------------------------------------------------------------
    # Phase 1 core ops
    # ------------------------------------------------------------------

    def fill(self, fields):
        """Smart form filling — auto-detect inputs by label/placeholder/name.

        Args:
            fields: dict mapping field labels/selectors to values.
                    e.g. {"Email": "user@example.com", "Password": "secret"}

        Returns:
            dict with 'filled' (list of {field, value, selector, success}) and 'skipped'.
        """
        return self._op('fill', fields=fields)

    def wait_for(self, condition, selector=None, text=None, timeout=None):
        """Smart conditional wait.

        Args:
            condition: One of 'visible', 'hidden', 'text', 'textChange',
                       'networkIdle', 'domStable', 'exists'.
            selector: CSS selector (required for most conditions).
            text: Text to wait for (required for 'text' condition).
            timeout: Timeout in ms (default 10000, max 30000).

        Returns:
            dict with 'waited', 'duration_ms', 'condition_met'.
        """
        kwargs = {'condition': condition}
        if selector is not None:
            kwargs['selector'] = selector
        if text is not None:
            kwargs['text'] = text
        if timeout is not None:
            kwargs['timeout'] = timeout
        return self._op('wait', **kwargs)

    def table(self, selector=None, index=None):
        """Extract tabular data from the page.

        Args:
            selector: Optional CSS selector of a specific table.
            index: Optional index of auto-detected table (0-based).

        Returns:
            dict with 'tables' list, each having 'headers', 'rows', 'rowCount'.
        """
        kwargs = {}
        if selector is not None:
            kwargs['selector'] = selector
        if index is not None:
            kwargs['index'] = index
        return self._op('table', **kwargs)

    def dialog(self, action='detect', text=None):
        """Handle dialogs, modals, cookie banners, and overlays.

        Args:
            action: 'detect', 'dismiss', 'accept', or 'interact'.
            text: Button text to click (required for 'interact').

        Returns:
            dict with 'found', 'action_taken', 'success'.
        """
        kwargs = {'action': action}
        if text is not None:
            kwargs['text'] = text
        return self._op('dialog', **kwargs)

    def paginate(self, action='detect', page=None):
        """Auto-pagination — detect and navigate pages.

        Args:
            action: 'detect', 'next', 'prev', or 'goto'.
            page: Page number (required for 'goto').

        Returns:
            dict with 'currentPage', 'totalPages', 'hasNext', 'hasPrev', 'paginationType'.
        """
        kwargs = {'action': action}
        if page is not None:
            kwargs['page'] = page
        return self._op('paginate', **kwargs)

    def select_option(self, selector, value=None, text=None, search=None, values=None):
        """Handle complex dropdown selection (native + React/MUI/custom).

        Args:
            selector: CSS selector of the dropdown trigger.
            value: Option value to select.
            text: Option display text to select.
            search: Text to type into search input first.
            values: List of values for multi-select.

        Returns:
            dict with 'selected', 'display', 'success'.
        """
        kwargs = {'selector': selector}
        if value is not None:
            kwargs['value'] = value
        if text is not None:
            kwargs['text'] = text
        if search is not None:
            kwargs['search'] = search
        if values is not None:
            kwargs['values'] = values
        return self._op('selectOption', **kwargs)


class Browser:
    """High-level interface to the PingOS gateway."""

    def __init__(self, host='localhost', port=3500):
        self.client = GatewayClient(host=host, port=port)

    def health(self):
        """Check gateway health."""
        return self.client._request('GET', '/v1/health')

    def devices(self):
        """List connected browser tab devices."""
        return self.client._request('GET', '/v1/devices')

    def tab(self, device_id):
        """Get a Tab instance for the given device ID."""
        return Tab(self.client, device_id)

    def find(self, query):
        """Search tab titles/URLs and return first matching Tab."""
        devs = self.devices()
        # Handle various response formats
        if isinstance(devs, dict):
            if 'extension' in devs:
                device_list = devs.get('extension', {}).get('devices', [])
            else:
                device_list = devs.get('devices', devs.get('tabs', []))
        elif isinstance(devs, list):
            device_list = devs
        else:
            device_list = []

        query_lower = query.lower()
        for d in device_list:
            title = d.get('title', '')
            url = d.get('url', '')
            did = d.get('deviceId') or d.get('device_id') or d.get('id', '')
            if query_lower in title.lower() or query_lower in url.lower():
                return Tab(self.client, did, title=title, url=url)
        return None

    def functions(self, app_name=None):
        """List callable functions.

        Args:
            app_name: Optional app name to filter (e.g. 'gmail').

        Returns:
            list of function definitions.
        """
        if app_name:
            resp = self.client._request('GET', f'/v1/functions/{app_name}')
        else:
            resp = self.client._request('GET', '/v1/functions')
        if isinstance(resp, dict):
            return resp.get('functions', [])
        return resp

    def call(self, app_name, function_name, **params):
        """Call a tab function.

        Args:
            app_name: App/tab name (e.g. 'gmail', 'amazon').
            function_name: Function operation (e.g. 'extract', 'click').
            **params: Parameters to pass to the function.

        Returns:
            Function result.
        """
        body = {
            'function': f'{app_name}.{function_name}',
            'params': params,
        }
        resp = self.client._request('POST', f'/v1/functions/{app_name}/call', body=body)
        if isinstance(resp, dict) and 'result' in resp:
            return resp['result']
        return resp

    def pipeline(self, definition):
        """Execute a cross-tab pipeline.

        Args:
            definition: Pipeline definition dict with 'name', 'steps', optional 'parallel'.

        Returns:
            PipelineResult dict with step outcomes and variables.
        """
        resp = self.client._request('POST', '/v1/pipelines/run', body=definition)
        if isinstance(resp, dict) and 'result' in resp:
            return resp['result']
        return resp

    def pipe(self, pipe_str):
        """Execute a pipe shorthand string.

        Args:
            pipe_str: Pipe syntax, e.g. "extract:amazon:.price | type:slack:#msg"

        Returns:
            PipelineResult dict.
        """
        resp = self.client._request('POST', '/v1/pipelines/pipe', body={'pipe': pipe_str})
        if isinstance(resp, dict) and 'result' in resp:
            return resp['result']
        return resp
