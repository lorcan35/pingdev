import time

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
