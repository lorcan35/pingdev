import click
import json
import os
import urllib.request
import urllib.error
import sys
from urllib.parse import urlparse


def _request(host, port, method, path, body=None):
    """Make an HTTP request to the PingOS gateway."""
    url = f'http://{host}:{port}{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as e:
        click.echo(f'Error: cannot reach gateway at {url}: {e}', err=True)
        raise SystemExit(1)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        click.echo(f'Error {e.code}: {body_text}', err=True)
        raise SystemExit(1)


def _request_soft(host, port, method, path, body=None):
    """Like _request but returns error dict instead of raising SystemExit."""
    url = f'http://{host}:{port}{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        try:
            return json.loads(body_text)
        except json.JSONDecodeError:
            return {'error': f'HTTP {e.code}: {body_text[:200]}'}
    except urllib.error.URLError as e:
        return {'error': f'Gateway unreachable: {e.reason}'}


def _get_devices(host, port):
    """Fetch the device list from the gateway."""
    return _request(host, port, 'GET', '/v1/devices')


def _parse_device_list(devs):
    """Extract flat device list from gateway response."""
    if isinstance(devs, list):
        return devs
    elif 'extension' in devs:
        return devs.get('extension', {}).get('devices', [])
    else:
        return devs.get('devices', devs.get('tabs', []))


def _auto_device(host, port, device):
    """If device is None, auto-detect if only one connected."""
    if device:
        return device
    devs = _get_devices(host, port)
    device_list = _parse_device_list(devs)
    if len(device_list) == 0:
        click.echo('No devices connected.', err=True)
        raise SystemExit(1)
    if len(device_list) == 1:
        d = device_list[0]
        did = d.get('deviceId') or d.get('device_id') or d.get('id')
        click.echo(f'Auto-selected: {did}', err=True)
        return did
    click.echo('Multiple devices connected. Specify one with DEVICE:', err=True)
    for d in device_list:
        did = d.get('deviceId') or d.get('device_id') or d.get('id')
        click.echo(f'  {did}  {d.get("url", "")}  {d.get("title", "")}', err=True)
    raise SystemExit(1)


def _run_op(ctx, device, op, body=None):
    """Run a device operation and output the result."""
    host = ctx.obj['host']
    port = ctx.obj['port']
    use_json = ctx.obj['json']
    device = _auto_device(host, port, device)
    result = _request(host, port, 'POST', f'/v1/dev/{device}/{op}', body)
    if use_json:
        click.echo(json.dumps(result, indent=2))
    else:
        if isinstance(result, dict) and result.get('ok'):
            data = result.get('result', '')
            if isinstance(data, str):
                click.echo(click.style(data, fg='green'))
            else:
                click.echo(json.dumps(data, indent=2))
        else:
            click.echo(click.style(json.dumps(result, indent=2), fg='yellow'))
    return result


@click.group()
@click.option('--host', default='localhost', help='Gateway host')
@click.option('--port', default=3500, type=int, help='Gateway port')
@click.option('--json', 'use_json', is_flag=True, help='Output raw JSON')
@click.pass_context
def cli(ctx, host, port, use_json):
    """PingOS CLI — control browser tabs from the terminal."""
    ctx.ensure_object(dict)
    ctx.obj['host'] = host
    ctx.obj['port'] = port
    ctx.obj['json'] = use_json


@cli.command()
@click.pass_context
def devices(ctx):
    """List connected devices."""
    host = ctx.obj['host']
    port = ctx.obj['port']
    use_json = ctx.obj['json']
    devs = _get_devices(host, port)
    device_list = _parse_device_list(devs)
    if use_json:
        click.echo(json.dumps(devs, indent=2))
        return
    if not device_list:
        click.echo('No devices connected.')
        return
    click.echo(click.style(f'{"ID":<30} {"TITLE":<42} {"DOMAIN"}', fg='cyan'))
    click.echo('-' * 90)
    for d in device_list:
        did = d.get('deviceId') or d.get('device_id') or d.get('id', '?')
        url = d.get('url', '')
        title = d.get('title', '')[:40]
        domain = urlparse(url).netloc if url else ''
        click.echo(f'{did:<30} {title:<42} {domain}')


@cli.command()
@click.argument('device', required=False, default=None)
@click.pass_context
def recon(ctx, device):
    """Run recon on a device to discover page structure."""
    _run_op(ctx, device, 'recon')


@cli.command()
@click.argument('instruction')
@click.argument('device', required=False, default=None)
@click.pass_context
def act(ctx, instruction, device):
    """Execute a natural-language instruction on a device.

    Usage: pingos act "click Search" [DEVICE]
    If DEVICE is omitted, auto-detects if only one is connected.
    """
    _run_op(ctx, device, 'act', {'instruction': instruction})


@cli.command()
@click.argument('schema')
@click.argument('device', required=False, default=None)
@click.pass_context
def extract(ctx, schema, device):
    """Extract structured data from a device using a JSON schema.

    Usage: pingos extract '{"title":"h1"}' [DEVICE]
    SCHEMA is a JSON string mapping names to CSS selectors.
    """
    try:
        parsed = json.loads(schema)
    except json.JSONDecodeError as e:
        click.echo(f'Invalid JSON schema: {e}', err=True)
        raise SystemExit(1)
    _run_op(ctx, device, 'extract', {'schema': parsed})


@cli.command()
@click.argument('device', required=False, default=None)
@click.pass_context
def screenshot(ctx, device):
    """Take a screenshot of a device."""
    host = ctx.obj['host']
    port = ctx.obj['port']
    use_json = ctx.obj['json']
    device = _auto_device(host, port, device)
    result = _request(host, port, 'POST', f'/v1/dev/{device}/screenshot')
    if use_json:
        click.echo(json.dumps(result, indent=2))
    else:
        if isinstance(result, dict):
            data = result.get('result', result)
            if isinstance(data, str) and (data.startswith('data:') or data.startswith('iVBOR')):
                # Base64 image data — save to file
                import base64
                img_data = data
                if ',' in img_data:
                    img_data = img_data.split(',', 1)[1]
                raw = base64.b64decode(img_data)
                fname = f'{device}-screenshot.png'
                with open(fname, 'wb') as f:
                    f.write(raw)
                click.echo(f'Screenshot saved to {fname}')
            else:
                click.echo(json.dumps(data, indent=2))
        else:
            click.echo(json.dumps(result, indent=2))


@cli.command()
@click.argument('device', required=False, default=None)
@click.pass_context
def observe(ctx, device):
    """Observe what actions are possible on the current page."""
    host = ctx.obj['host']
    port = ctx.obj['port']
    use_json = ctx.obj['json']
    device = _auto_device(host, port, device)
    result = _request(host, port, 'POST', f'/v1/dev/{device}/observe')
    if use_json:
        click.echo(json.dumps(result, indent=2))
        return
    data = result.get('result', result) if isinstance(result, dict) else result
    if isinstance(data, dict):
        if data.get('summary'):
            click.echo(click.style('\n📋 Summary', fg='cyan', bold=True))
            click.echo(f'  {data["summary"]}\n')
        if data.get('actions'):
            click.echo(click.style('⚡ Actions', fg='cyan', bold=True))
            for a in data['actions']:
                click.echo(click.style(f'  • {a}', fg='green'))
            click.echo()
        if data.get('navigation'):
            click.echo(click.style('🧭 Navigation', fg='cyan', bold=True))
            for n in data['navigation']:
                click.echo(f'  • {n}')
            click.echo()
        if data.get('forms'):
            click.echo(click.style('📝 Forms', fg='cyan', bold=True))
            for f in data['forms']:
                name = f.get('name', 'Form')
                fields = f.get('fields', [])
                click.echo(f'  {name}: {", ".join(fields)}')
            click.echo()
    else:
        click.echo(json.dumps(data, indent=2))


@cli.command()
@click.argument('selector')
@click.argument('device', required=False, default=None)
@click.pass_context
def read(ctx, selector, device):
    """Read text content of an element.

    Usage: pingos read "h1" [DEVICE]
    SELECTOR is a CSS selector or text=/aria=/role= prefix selector.
    """
    _run_op(ctx, device, 'read', {'selector': selector})


def _find_pingapps_dir():
    """Find the pingapps directory, checking multiple locations."""
    candidates = [
        os.path.join(os.path.dirname(__file__), '..', '..', '..', 'projects', 'pingapps'),
        os.path.join(os.getcwd(), 'projects', 'pingapps'),
        os.path.expanduser('~/projects/pingdev/projects/pingapps'),
    ]
    for c in candidates:
        if os.path.isdir(c):
            return os.path.realpath(c)
    return None


def _list_pingapps(apps_dir):
    """List available PingApps from directory."""
    results = []
    for entry in sorted(os.listdir(apps_dir)):
        manifest_path = os.path.join(apps_dir, entry, 'manifest.json')
        if not os.path.isfile(manifest_path):
            continue
        with open(manifest_path) as f:
            manifest = json.load(f)
        workflows = []
        wf_dir = os.path.join(apps_dir, entry, 'workflows')
        if os.path.isdir(wf_dir):
            for wf_file in sorted(os.listdir(wf_dir)):
                if wf_file.endswith('.json'):
                    workflows.append(wf_file[:-5])
        results.append({
            'name': entry,
            'display_name': manifest.get('name', entry),
            'description': manifest.get('description', ''),
            'version': manifest.get('version', '0.0.0'),
            'workflows': workflows,
        })
    return results


@cli.command('apps')
@click.pass_context
def list_apps(ctx):
    """List available PingApps."""
    use_json = ctx.obj['json']
    apps_dir = _find_pingapps_dir()
    if not apps_dir:
        click.echo('No PingApps directory found.', err=True)
        raise SystemExit(1)
    apps_list = _list_pingapps(apps_dir)
    if use_json:
        click.echo(json.dumps(apps_list, indent=2))
        return
    if not apps_list:
        click.echo('No PingApps found.')
        return
    click.echo(click.style(f'{"APP":<20} {"VERSION":<10} {"WORKFLOWS":<30} {"DESCRIPTION"}', fg='cyan'))
    click.echo('-' * 90)
    for app in apps_list:
        wf_str = ', '.join(app['workflows']) if app['workflows'] else '(none)'
        click.echo(f'{app["name"]:<20} {app["version"]:<10} {wf_str:<30} {app["description"][:40]}')


@cli.command()
@click.argument('app_name')
@click.argument('workflow_name')
@click.option('--input', '-i', 'inputs', multiple=True, help='Input as key=value')
@click.argument('device', required=False, default=None)
@click.pass_context
def run(ctx, app_name, workflow_name, inputs, device):
    """Run a PingApp workflow.

    Example: pingos run youtube search-and-play -i query="ESP32 tutorial"
    """
    import re
    host = ctx.obj['host']
    port = ctx.obj['port']
    use_json = ctx.obj['json']

    # Parse inputs
    variables = {}
    for inp in inputs:
        if '=' not in inp:
            click.echo(f'Invalid input format: {inp} (expected key=value)', err=True)
            raise SystemExit(1)
        k, v = inp.split('=', 1)
        variables[k.strip()] = v.strip()

    # Find and load workflow
    apps_dir = _find_pingapps_dir()
    if not apps_dir:
        click.echo('No PingApps directory found.', err=True)
        raise SystemExit(1)

    wf_path = os.path.join(apps_dir, app_name, 'workflows', f'{workflow_name}.json')
    if not os.path.isfile(wf_path):
        click.echo(f'Workflow not found: {app_name}/{workflow_name}', err=True)
        # Show available workflows
        wf_dir = os.path.join(apps_dir, app_name, 'workflows')
        if os.path.isdir(wf_dir):
            avail = [f[:-5] for f in os.listdir(wf_dir) if f.endswith('.json')]
            if avail:
                click.echo(f'Available workflows: {", ".join(avail)}', err=True)
        raise SystemExit(1)

    with open(wf_path) as f:
        workflow = json.load(f)

    # Resolve device
    device = _auto_device(host, port, device)

    click.echo(click.style(f'Running {app_name}/{workflow_name}', fg='cyan', bold=True))
    if variables:
        click.echo(f'  Inputs: {variables}')
    click.echo()

    def _resolve_template(text, varz):
        """Replace {{var}} templates in text."""
        def _resolve_ref(match):
            ref = match.group(1).strip()
            try:
                parts = ref.split('.')
                current = varz
                for part in parts:
                    idx_match = re.match(r'^(\w+)\[(\d+)\]$', part)
                    if idx_match:
                        key, idx = idx_match.group(1), int(idx_match.group(2))
                        current = current[key][idx]
                    else:
                        current = current[part]
                return str(current)
            except (KeyError, IndexError, TypeError):
                return match.group(0)
        return re.sub(r'\{\{(.+?)\}\}', _resolve_ref, text)

    results = []
    for i, step in enumerate(workflow['steps'], 1):
        op = step['op']
        # Resolve templates
        resolved = {}
        for k, v in step.items():
            if isinstance(v, str):
                resolved[k] = _resolve_template(v, variables)
            elif isinstance(v, dict):
                resolved[k] = {
                    sk: _resolve_template(sv, variables) if isinstance(sv, str) else sv
                    for sk, sv in v.items()
                }
            else:
                resolved[k] = v

        # Show step
        step_desc = op
        if op == 'act':
            step_desc = f'act: {resolved.get("instruction", "")[:60]}'
        elif op == 'navigate':
            step_desc = f'navigate: {resolved.get("url", "")[:60]}'
        elif op == 'type':
            step_desc = f'type: "{resolved.get("text", "")[:40]}"'
        elif op == 'click':
            step_desc = f'click: {resolved.get("selector", "")[:40]}'
        elif op == 'extract':
            step_desc = f'extract: {list(resolved.get("schema", {}).keys())}'
        elif op == 'read':
            step_desc = f'read: {resolved.get("selector", "")[:40]}'
        elif op == 'wait':
            step_desc = f'wait: {resolved.get("seconds", 1)}s'

        click.echo(click.style(f'  [{i}/{len(workflow["steps"])}] {step_desc}', fg='yellow'))

        # Execute
        try:
            if op == 'wait':
                import time
                time.sleep(resolved.get('seconds', 1))
                result = {'waited': resolved.get('seconds', 1)}
            else:
                body = {}
                if op == 'act':
                    body = {'instruction': resolved['instruction']}
                elif op == 'extract':
                    body = {'schema': resolved.get('schema', {})}
                elif op == 'click':
                    body = {'selector': resolved['selector']}
                elif op == 'type':
                    body = {'text': resolved['text']}
                    if resolved.get('selector'):
                        body['selector'] = resolved['selector']
                elif op == 'press':
                    body = {'key': resolved['key']}
                elif op == 'read':
                    body = {'selector': resolved['selector']}
                elif op == 'scroll':
                    body = {'direction': resolved.get('direction', 'down'), 'amount': resolved.get('amount', 3)}
                elif op == 'navigate':
                    body = {'url': resolved['url']}
                elif op == 'eval':
                    body = {'expression': resolved['expression']}
                # observe, recon, screenshot have no body

                result = _request_soft(host, port, 'POST', f'/v1/dev/{device}/{op}', body or None)
        except Exception as e:
            click.echo(click.style(f'    ERROR: {e}', fg='red'))
            result = {'error': str(e)}

        results.append({'step': step, 'result': result})

        # Show result summary
        if isinstance(result, dict):
            if result.get('ok'):
                data = result.get('result', '')
                if isinstance(data, str) and len(data) > 80:
                    click.echo(click.style(f'    OK: {data[:80]}...', fg='green'))
                elif isinstance(data, dict):
                    click.echo(click.style(f'    OK: {json.dumps(data)[:80]}', fg='green'))
                else:
                    click.echo(click.style(f'    OK: {data}', fg='green'))
            elif result.get('error'):
                click.echo(click.style(f'    Error: {result["error"]}', fg='red'))
            elif result.get('waited'):
                click.echo(click.style(f'    Waited {result["waited"]}s', fg='green'))

        # Merge extract results into variables
        if op == 'extract' and isinstance(result, dict):
            data = result.get('result', result)
            if isinstance(data, dict):
                variables.update(data)

    click.echo()
    click.echo(click.style('Done!', fg='green', bold=True))

    if use_json:
        click.echo(json.dumps({'steps': results, 'variables': variables}, indent=2, default=str))


if __name__ == '__main__':
    cli()
