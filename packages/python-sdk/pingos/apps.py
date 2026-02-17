"""PingApp runner — loads and executes PingApp workflows."""
import json
import os
import re
import glob as globmod


PINGAPPS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'projects', 'pingapps')


def find_pingapps_dir():
    """Find the pingapps directory, checking multiple locations."""
    candidates = [
        PINGAPPS_DIR,
        os.path.join(os.getcwd(), 'projects', 'pingapps'),
        os.path.expanduser('~/projects/pingdev/projects/pingapps'),
    ]
    for c in candidates:
        if os.path.isdir(c):
            return os.path.realpath(c)
    return None


def list_apps():
    """List available PingApps. Returns list of dicts with name, description, workflows."""
    apps_dir = find_pingapps_dir()
    if not apps_dir:
        return []
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
            'tags': manifest.get('tags', []),
        })
    return results


def load_manifest(app_name):
    """Load a PingApp manifest.json. Returns dict."""
    apps_dir = find_pingapps_dir()
    if not apps_dir:
        raise FileNotFoundError('PingApps directory not found')
    manifest_path = os.path.join(apps_dir, app_name, 'manifest.json')
    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(f'No manifest found for app: {app_name}')
    with open(manifest_path) as f:
        return json.load(f)


def load_workflow(app_name, workflow_name):
    """Load a workflow JSON. Returns dict."""
    apps_dir = find_pingapps_dir()
    if not apps_dir:
        raise FileNotFoundError('PingApps directory not found')
    wf_path = os.path.join(apps_dir, app_name, 'workflows', f'{workflow_name}.json')
    if not os.path.isfile(wf_path):
        raise FileNotFoundError(f'Workflow not found: {app_name}/{workflow_name}')
    with open(wf_path) as f:
        return json.load(f)


def resolve_template(text, variables):
    """Replace {{var}}, {{array[0]}}, and {{result.key}} in text with actual values.

    Supports:
    - {{query}} — simple variable lookup
    - {{titles[0]}} — array index access
    - {{result.key}} — nested dict access
    - {{result.key[1]}} — combined dot + index
    """
    def _resolve_ref(match):
        ref = match.group(1).strip()
        try:
            value = _lookup(ref, variables)
            if value is None:
                return match.group(0)  # leave unresolved
            return str(value)
        except (KeyError, IndexError, TypeError):
            return match.group(0)  # leave unresolved

    return re.sub(r'\{\{(.+?)\}\}', _resolve_ref, text)


def _lookup(ref, variables):
    """Resolve a dotted/indexed reference against a variables dict.

    Examples: "query", "titles[0]", "result.title", "items[2].name"
    """
    parts = re.split(r'\.', ref)
    current = variables
    for part in parts:
        # Check for array index: name[0]
        idx_match = re.match(r'^(\w+)\[(\d+)\]$', part)
        if idx_match:
            key, idx = idx_match.group(1), int(idx_match.group(2))
            current = current[key][idx]
        else:
            current = current[part]
    return current


def run_workflow(tab, app_name, workflow_name, inputs=None):
    """Execute a workflow against a live browser tab.

    Args:
        tab: pingos.Tab instance
        app_name: e.g. "youtube"
        workflow_name: e.g. "search-and-play"
        inputs: dict of input variables, e.g. {"query": "ESP32 tutorial"}

    Returns:
        dict with step results and final variables
    """
    workflow = load_workflow(app_name, workflow_name)
    variables = dict(inputs or {})
    results = []

    for step in workflow['steps']:
        op = step['op']
        # Resolve template variables in all string values
        resolved = {}
        for k, v in step.items():
            if isinstance(v, str):
                resolved[k] = resolve_template(v, variables)
            elif isinstance(v, dict):
                resolved[k] = {
                    sk: resolve_template(sv, variables) if isinstance(sv, str) else sv
                    for sk, sv in v.items()
                }
            else:
                resolved[k] = v

        # Execute the op
        if op == 'act':
            result = tab.act(resolved['instruction'])
        elif op == 'extract':
            result = tab.extract(resolved.get('schema', {}))
        elif op == 'click':
            result = tab.click(resolved['selector'])
        elif op == 'type':
            result = tab.type(resolved['text'], resolved.get('selector'))
        elif op == 'press':
            result = tab.press(resolved['key'])
        elif op == 'read':
            result = tab.read(resolved['selector'])
        elif op == 'scroll':
            result = tab.scroll(
                resolved.get('direction', 'down'),
                resolved.get('amount', 3),
            )
        elif op == 'wait':
            tab.wait(resolved.get('seconds', 1))
            result = {'waited': resolved.get('seconds', 1)}
        elif op == 'navigate':
            result = tab._op('navigate', url=resolved['url'])
        elif op == 'observe':
            result = tab.observe()
        elif op == 'recon':
            result = tab.recon()
        elif op == 'screenshot':
            result = tab.screenshot()
        elif op == 'eval':
            result = tab.eval(resolved['expression'])
        else:
            result = {'error': f'Unknown op: {op}'}

        results.append({'step': step, 'result': result})

        # If extract returned data, merge into variables
        if op == 'extract' and isinstance(result, dict):
            data = result.get('result', result)
            if isinstance(data, dict):
                variables.update(data)

    return {'steps': results, 'variables': variables}
