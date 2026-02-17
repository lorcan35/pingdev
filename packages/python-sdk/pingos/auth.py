"""Auth flow support — check authentication state and run login sequences."""
import json
import os
import re
import time


def check_auth(tab, auth_config):
    """Check if the tab is authenticated based on the auth config.

    Supported auth types:
    - "cookie-check": evaluate JS to check cookies
    - "element-check": check if a login element is visible (means NOT authed)
    - "url-check": check if current URL matches an expected pattern

    Args:
        tab: Tab instance
        auth_config: dict with "type" and "check" fields

    Returns:
        True if authenticated, False otherwise.
    """
    auth_type = auth_config.get('type', 'cookie-check')
    check = auth_config.get('check', {})

    if auth_type == 'cookie-check':
        expression = check.get('expression', "document.cookie.length > 0")
        result = tab.eval(expression)
        # eval returns various formats — extract the boolean
        if isinstance(result, dict):
            val = result.get('result', result)
        else:
            val = result
        return bool(val) and val != 'false'

    elif auth_type == 'element-check':
        # If the login element is found, user is NOT authenticated
        selector = check.get('selector', '')
        if not selector:
            return True
        try:
            result = tab.read(selector)
            # If we can read the login element, we're not logged in
            if result and result != [] and result != '':
                return False
            return True
        except Exception:
            # Element not found — likely authenticated
            return True

    elif auth_type == 'url-check':
        pattern = check.get('pattern', '')
        if not pattern:
            return True
        # Get current URL via JS
        result = tab.eval('window.location.href')
        url = result
        if isinstance(result, dict):
            url = result.get('result', '')
        return bool(re.search(pattern, str(url)))

    return False


def _resolve_credentials(text, credentials):
    """Replace {{env.VAR}} placeholders with credential values or env vars.

    Resolution order:
    1. credentials dict (e.g., credentials["EMAIL"])
    2. os.environ (e.g., os.environ["EMAIL"])

    Args:
        text: string potentially containing {{env.VAR}} placeholders
        credentials: dict of credential values

    Returns:
        Resolved string.
    """
    def _replace(match):
        var_name = match.group(1).strip()
        # Check credentials dict first
        if var_name in credentials:
            return str(credentials[var_name])
        # Fall back to environment variables
        env_val = os.environ.get(var_name, '')
        return env_val

    return re.sub(r'\{\{env\.(.+?)\}\}', _replace, text)


def run_login(tab, auth_config, credentials=None):
    """Execute a login sequence against a browser tab.

    Args:
        tab: Tab instance
        auth_config: dict with "login" section containing "url" and "steps"
        credentials: optional dict of credential values (e.g., {"EMAIL": "...", "PASSWORD": "..."})

    Returns:
        True if login succeeded (auth check passes after login), False otherwise.
    """
    if credentials is None:
        credentials = {}

    login_config = auth_config.get('login', {})
    login_url = login_config.get('url')
    steps = login_config.get('steps', [])

    # Navigate to login page
    if login_url:
        tab._op('navigate', url=login_url)
        time.sleep(2)  # Wait for page load

    # Execute login steps
    for step in steps:
        op = step.get('op', '')

        # Resolve credential placeholders in string values
        resolved = {}
        for k, v in step.items():
            if isinstance(v, str):
                resolved[k] = _resolve_credentials(v, credentials)
            else:
                resolved[k] = v

        if op == 'type':
            tab.type(resolved['text'], resolved.get('selector'))
        elif op == 'click':
            tab.click(resolved['selector'])
        elif op == 'press':
            tab.press(resolved.get('key', 'Enter'))
        elif op == 'wait':
            tab.wait(resolved.get('seconds', 1))
        elif op == 'act':
            tab.act(resolved['instruction'])
        elif op == 'eval':
            tab.eval(resolved['expression'])
        elif op == 'navigate':
            tab._op('navigate', url=resolved['url'])

    # Verify auth succeeded
    time.sleep(2)
    return check_auth(tab, auth_config)


def load_credentials(app_name=None):
    """Load credentials from environment or credentials file.

    Priority:
    1. Environment variables (if app_name given, checks APP_NAME_EMAIL, etc.)
    2. ~/.pingos/credentials.json
    3. Empty dict

    Args:
        app_name: optional app name to scope credential lookup

    Returns:
        dict of credential key-value pairs.
    """
    creds = {}

    # Try loading from credentials file
    creds_path = os.path.expanduser('~/.pingos/credentials.json')
    if os.path.isfile(creds_path):
        with open(creds_path) as f:
            all_creds = json.load(f)
        if app_name and app_name in all_creds:
            creds = dict(all_creds[app_name])
        elif app_name is None:
            creds = dict(all_creds)

    # Environment variables override file-based credentials
    if app_name:
        prefix = app_name.upper().replace('-', '_') + '_'
        for key, val in os.environ.items():
            if key.startswith(prefix):
                # Strip prefix: GMAIL_EMAIL -> EMAIL
                short_key = key[len(prefix):]
                creds[short_key] = val
    else:
        # Check common auth env vars
        for key in ('EMAIL', 'PASSWORD', 'USERNAME', 'API_KEY', 'TOKEN'):
            val = os.environ.get(key)
            if val:
                creds[key] = val

    return creds
