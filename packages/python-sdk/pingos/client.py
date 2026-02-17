import json
import urllib.request
import urllib.error


class GatewayClient:
    """Low-level HTTP client for the PingOS gateway."""

    def __init__(self, host='localhost', port=3500):
        self.base_url = f'http://{host}:{port}'

    def _request(self, method, path, body=None):
        """Send an HTTP request and return parsed JSON.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: URL path (e.g. /v1/devices)
            body: Optional dict to send as JSON body

        Returns:
            Parsed JSON response.

        Raises:
            urllib.error.HTTPError: On non-2xx responses.
            RuntimeError: On connection or protocol errors.
        """
        url = self.base_url + path
        data = None
        headers = {}

        if body is not None:
            data = json.dumps(body).encode('utf-8')
            headers['Content-Type'] = 'application/json'

        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode('utf-8')
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            raise RuntimeError(
                f'PingOS gateway error: HTTP {e.code} on {method} {path}: {error_body}'
            ) from e
        except urllib.error.URLError as e:
            raise RuntimeError(
                f'PingOS gateway connection error: {e.reason}'
            ) from e
