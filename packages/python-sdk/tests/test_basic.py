import json
import unittest
from unittest.mock import patch, MagicMock
from io import BytesIO
from urllib.error import HTTPError

from pingos import Browser, Tab
from pingos.client import GatewayClient


def _mock_response(data):
    """Create a mock urllib response that returns JSON data."""
    body = json.dumps(data).encode('utf-8')
    resp = MagicMock()
    resp.read.return_value = body
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


class TestGatewayClient(unittest.TestCase):

    def test_base_url(self):
        client = GatewayClient('myhost', 9000)
        self.assertEqual(client.base_url, 'http://myhost:9000')

    def test_default_base_url(self):
        client = GatewayClient()
        self.assertEqual(client.base_url, 'http://localhost:3500')

    @patch('pingos.client.urllib.request.urlopen')
    def test_get_request(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'status': 'healthy'})
        client = GatewayClient()
        result = client._request('GET', '/v1/health')
        self.assertEqual(result, {'status': 'healthy'})

        # Verify the request was made correctly
        call_args = mock_urlopen.call_args[0][0]
        self.assertEqual(call_args.full_url, 'http://localhost:3500/v1/health')
        self.assertEqual(call_args.method, 'GET')
        self.assertIsNone(call_args.data)

    @patch('pingos.client.urllib.request.urlopen')
    def test_post_request_with_body(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': 'done'})
        client = GatewayClient()
        result = client._request('POST', '/v1/dev/tab1/click', {'selector': '#btn'})
        self.assertEqual(result, {'ok': True, 'result': 'done'})

        call_args = mock_urlopen.call_args[0][0]
        self.assertEqual(call_args.method, 'POST')
        self.assertEqual(json.loads(call_args.data), {'selector': '#btn'})
        self.assertEqual(call_args.headers['Content-type'], 'application/json')

    @patch('pingos.client.urllib.request.urlopen')
    def test_http_error_raises_runtime_error(self, mock_urlopen):
        error = HTTPError(
            'http://localhost:3500/v1/bad', 404, 'Not Found',
            {}, BytesIO(b'not found')
        )
        mock_urlopen.side_effect = error
        client = GatewayClient()
        with self.assertRaises(RuntimeError) as ctx:
            client._request('GET', '/v1/bad')
        self.assertIn('HTTP 404', str(ctx.exception))


class TestBrowser(unittest.TestCase):

    @patch('pingos.client.urllib.request.urlopen')
    def test_health(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'status': 'healthy'})
        browser = Browser()
        result = browser.health()
        self.assertEqual(result['status'], 'healthy')

    @patch('pingos.client.urllib.request.urlopen')
    def test_devices(self, mock_urlopen):
        devices = [{'id': 'tab1', 'title': 'Google'}]
        mock_urlopen.return_value = _mock_response(devices)
        browser = Browser()
        result = browser.devices()
        self.assertEqual(result, devices)

    def test_tab_returns_tab_instance(self):
        browser = Browser()
        tab = browser.tab('tab1')
        self.assertIsInstance(tab, Tab)
        self.assertEqual(tab.device_id, 'tab1')


class TestTab(unittest.TestCase):

    def setUp(self):
        self.client = GatewayClient()

    @patch('pingos.client.urllib.request.urlopen')
    def test_recon(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': {'elements': []}})
        tab = Tab(self.client, 'tab1')
        result = tab.recon()
        self.assertTrue(result['ok'])
        call_args = mock_urlopen.call_args[0][0]
        self.assertIn('/v1/dev/tab1/recon', call_args.full_url)

    @patch('pingos.client.urllib.request.urlopen')
    def test_click(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True})
        tab = Tab(self.client, 'tab1')
        tab.click('#my-button')
        call_args = mock_urlopen.call_args[0][0]
        body = json.loads(call_args.data)
        self.assertEqual(body['selector'], '#my-button')

    @patch('pingos.client.urllib.request.urlopen')
    def test_type_with_selector(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True})
        tab = Tab(self.client, 'tab1')
        tab.type('hello', selector='#input')
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['text'], 'hello')
        self.assertEqual(body['selector'], '#input')

    @patch('pingos.client.urllib.request.urlopen')
    def test_type_without_selector(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True})
        tab = Tab(self.client, 'tab1')
        tab.type('hello')
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['text'], 'hello')
        self.assertIsNone(body['selector'])

    @patch('pingos.client.urllib.request.urlopen')
    def test_act(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': 'clicked'})
        tab = Tab(self.client, 'tab1')
        result = tab.act('click the login button')
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['instruction'], 'click the login button')

    @patch('pingos.client.urllib.request.urlopen')
    def test_extract(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': {'title': 'Hello'}})
        tab = Tab(self.client, 'tab1')
        schema = {'title': 'h1'}
        result = tab.extract(schema)
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['schema'], schema)

    @patch('pingos.client.urllib.request.urlopen')
    def test_press(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True})
        tab = Tab(self.client, 'tab1')
        tab.press('Enter')
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['key'], 'Enter')

    @patch('pingos.client.urllib.request.urlopen')
    def test_scroll(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True})
        tab = Tab(self.client, 'tab1')
        tab.scroll('up', 5)
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['direction'], 'up')
        self.assertEqual(body['amount'], 5)

    @patch('pingos.client.urllib.request.urlopen')
    def test_scroll_defaults(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True})
        tab = Tab(self.client, 'tab1')
        tab.scroll()
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['direction'], 'down')
        self.assertEqual(body['amount'], 3)

    @patch('pingos.client.urllib.request.urlopen')
    def test_read(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': 'Some text'})
        tab = Tab(self.client, 'tab1')
        result = tab.read('.content')
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['selector'], '.content')

    @patch('pingos.client.urllib.request.urlopen')
    def test_screenshot(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': 'base64...'})
        tab = Tab(self.client, 'tab1')
        result = tab.screenshot()
        call_args = mock_urlopen.call_args[0][0]
        self.assertIn('/v1/dev/tab1/screenshot', call_args.full_url)
        self.assertIsNone(call_args.data)

    @patch('pingos.client.urllib.request.urlopen')
    def test_eval(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({'ok': True, 'result': 42})
        tab = Tab(self.client, 'tab1')
        result = tab.eval('1 + 1')
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(body['expression'], '1 + 1')

    @patch('pingos.client.urllib.request.urlopen')
    def test_observe(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            'ok': True,
            'result': {
                'summary': 'Test page',
                'actions': ['Click button'],
                'navigation': ['Home'],
                'forms': []
            }
        })
        tab = Tab(self.client, 'tab1')
        result = tab.observe()
        call_args = mock_urlopen.call_args[0][0]
        self.assertIn('/v1/dev/tab1/observe', call_args.full_url)

    @patch('pingos.client.urllib.request.urlopen')
    def test_read_list_response(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            'ok': True,
            'result': ['text1', 'text2', 'text3']
        })
        tab = Tab(self.client, 'tab1')
        result = tab.read('.items')
        self.assertEqual(result, ['text1', 'text2', 'text3'])

    @patch('pingos.client.urllib.request.urlopen')
    def test_read_string_response(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            'ok': True, 'result': 'Hello World'
        })
        tab = Tab(self.client, 'tab1')
        result = tab.read('h1')
        self.assertEqual(result, 'Hello World')

    def test_wait(self):
        tab = Tab(self.client, 'tab1')
        import time
        start = time.time()
        result = tab.wait(0.1)
        elapsed = time.time() - start
        self.assertGreaterEqual(elapsed, 0.09)
        self.assertIs(result, tab)  # returns self for chaining

    def test_repr_with_title(self):
        tab = Tab(self.client, 'chrome-123', title='Google')
        self.assertEqual(repr(tab), 'Tab(chrome-123 "Google")')

    def test_repr_without_title(self):
        tab = Tab(self.client, 'chrome-123')
        self.assertEqual(repr(tab), 'Tab(chrome-123)')


class TestBrowserFind(unittest.TestCase):

    @patch('pingos.client.urllib.request.urlopen')
    def test_find_by_title(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            'extension': {
                'devices': [
                    {'deviceId': 'chrome-1', 'title': 'Google Search', 'url': 'https://google.com'},
                    {'deviceId': 'chrome-2', 'title': 'GitHub', 'url': 'https://github.com'},
                ]
            }
        })
        browser = Browser()
        tab = browser.find('Google')
        self.assertIsNotNone(tab)
        self.assertEqual(tab.device_id, 'chrome-1')
        self.assertEqual(tab.title, 'Google Search')

    @patch('pingos.client.urllib.request.urlopen')
    def test_find_by_url(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            'extension': {
                'devices': [
                    {'deviceId': 'chrome-1', 'title': 'Google', 'url': 'https://google.com'},
                    {'deviceId': 'chrome-2', 'title': 'GH', 'url': 'https://github.com'},
                ]
            }
        })
        browser = Browser()
        tab = browser.find('github')
        self.assertIsNotNone(tab)
        self.assertEqual(tab.device_id, 'chrome-2')

    @patch('pingos.client.urllib.request.urlopen')
    def test_find_no_match(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            'extension': {'devices': []}
        })
        browser = Browser()
        tab = browser.find('nonexistent')
        self.assertIsNone(tab)


if __name__ == '__main__':
    unittest.main()
