import click
import json
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


if __name__ == '__main__':
    cli()
