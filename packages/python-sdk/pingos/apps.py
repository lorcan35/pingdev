"""PingApp runner — loads and executes PingApp workflows."""
import json
import os
import re
import time
import glob as globmod

from .persistence import save as save_output
from .auth import check_auth, run_login, load_credentials
from .multi_tab import MultiTabContext
from .template_engine import (
    resolve_template, resolve_value, evaluate_condition,
)


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


# ---------------------------------------------------------------------------
# Step helpers
# ---------------------------------------------------------------------------

def _resolve_step(step, variables):
    """Resolve template variables in all string values of a step dict."""
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
    return resolved


def _execute_browser_op(step_tab, op, resolved):
    """Execute a single browser operation. Returns the result."""
    if op == 'act':
        return step_tab.act(resolved['instruction'])
    elif op == 'extract':
        return step_tab.extract(resolved.get('schema', {}))
    elif op == 'click':
        return step_tab.click(resolved['selector'])
    elif op == 'type':
        return step_tab.type(resolved['text'], resolved.get('selector'))
    elif op == 'press':
        return step_tab.press(resolved['key'])
    elif op == 'read':
        return step_tab.read(resolved['selector'])
    elif op == 'scroll':
        return step_tab.scroll(
            resolved.get('direction', 'down'),
            resolved.get('amount', 3),
        )
    elif op == 'wait':
        step_tab.wait(resolved.get('seconds', 1))
        return {'waited': resolved.get('seconds', 1)}
    elif op == 'navigate':
        return step_tab._op('navigate', url=resolved['url'])
    elif op == 'observe':
        return step_tab.observe()
    elif op == 'recon':
        return step_tab.recon()
    elif op == 'screenshot':
        return step_tab.screenshot()
    elif op == 'eval':
        return step_tab.eval(resolved['expression'])
    else:
        return {'error': f'Unknown op: {op}'}


def _handle_error_recovery(step, step_index, error, step_tab, variables, results,
                           error_log, workflow_defaults, total_retries_used):
    """Handle per-step error recovery.

    Returns (result, should_continue, total_retries_used).
    """
    on_error = step.get('onError', workflow_defaults.get('onError', 'abort'))
    max_total = workflow_defaults.get('maxTotalRetries', 10)

    if on_error == 'retry':
        max_retries = step.get('maxRetries', 3)
        for attempt in range(1, max_retries + 1):
            if total_retries_used >= max_total:
                error_log.append({
                    'step_index': step_index,
                    'error': str(error),
                    'recovery_action': 'abort (max total retries exceeded)',
                    'retries': attempt - 1,
                })
                return {'error': str(error)}, False, total_retries_used
            total_retries_used += 1
            delay = min(2 ** (attempt - 1), 10)  # exponential backoff, max 10s
            time.sleep(delay)
            try:
                resolved = _resolve_step(step, variables)
                result = _execute_browser_op(step_tab, step['op'], resolved)
                error_log.append({
                    'step_index': step_index,
                    'error': str(error),
                    'recovery_action': 'retry',
                    'retries': attempt,
                })
                return result, True, total_retries_used
            except Exception as retry_err:
                error = retry_err
        # All retries exhausted
        error_log.append({
            'step_index': step_index,
            'error': str(error),
            'recovery_action': 'abort (retries exhausted)',
            'retries': max_retries,
        })
        return {'error': str(error)}, False, total_retries_used

    elif on_error == 'skip':
        default_val = step.get('default', {})
        error_log.append({
            'step_index': step_index,
            'error': str(error),
            'recovery_action': 'skip',
            'retries': 0,
        })
        return default_val, True, total_retries_used

    elif on_error == 'fallback':
        fallback_steps = step.get('fallback', [])
        error_log.append({
            'step_index': step_index,
            'error': str(error),
            'recovery_action': 'fallback',
            'retries': 0,
        })
        if fallback_steps:
            fb = _run_steps(step_tab, fallback_steps, variables, results,
                            error_log, workflow_defaults, total_retries_used)
            total_retries_used = fb.get('_total_retries', total_retries_used)
            return fb.get('last_result', {}), True, total_retries_used
        return {'error': str(error)}, True, total_retries_used

    else:  # abort
        error_log.append({
            'step_index': step_index,
            'error': str(error),
            'recovery_action': 'abort',
            'retries': 0,
        })
        return {'error': str(error)}, False, total_retries_used


def _run_steps(step_tab, steps, variables, results, error_log,
               workflow_defaults, total_retries_used, multi_tab=None,
               default_tab=None):
    """Execute a list of workflow steps (recursive for if/loop/fallback).

    Returns dict with last_result, _total_retries, and optional aborted flag.
    """
    last_result = None

    for step_index, step in enumerate(steps):
        op = step['op']

        # Resolve which tab to use for this step
        current_tab = step_tab
        if multi_tab and 'tab' in step:
            current_tab = multi_tab.get_tab(step['tab'])

        # --- Conditional: if ---
        if op == 'if':
            condition = resolve_template(step['condition'], variables)
            taken = evaluate_condition(condition, variables)
            branch = step.get('then', []) if taken else step.get('else', [])
            if branch:
                sub = _run_steps(current_tab, branch, variables, results,
                                 error_log, workflow_defaults, total_retries_used,
                                 multi_tab=multi_tab, default_tab=default_tab)
                total_retries_used = sub.get('_total_retries', total_retries_used)
                last_result = sub.get('last_result')
                if sub.get('aborted'):
                    return {'last_result': last_result,
                            '_total_retries': total_retries_used, 'aborted': True}
            results.append({'step': step, 'result': {'branch': 'then' if taken else 'else'}})
            continue

        # --- Loop ---
        if op == 'loop':
            items = resolve_value(step['over'], variables)
            if not isinstance(items, list):
                results.append({'step': step,
                                'result': {'error': 'loop "over" did not resolve to a list'}})
                continue
            loop_var = step.get('as', 'item')
            for item in items:
                variables[loop_var] = item
                sub = _run_steps(current_tab, step['steps'], variables, results,
                                 error_log, workflow_defaults, total_retries_used,
                                 multi_tab=multi_tab, default_tab=default_tab)
                total_retries_used = sub.get('_total_retries', total_retries_used)
                last_result = sub.get('last_result')
                if sub.get('aborted'):
                    return {'last_result': last_result,
                            '_total_retries': total_retries_used, 'aborted': True}
            continue

        # --- Set variable ---
        if op == 'set':
            var_name = step['var']
            variables[var_name] = resolve_value(step['value'], variables)
            results.append({'step': step,
                            'result': {'set': var_name, 'value': variables[var_name]}})
            continue

        # --- Assert ---
        if op == 'assert':
            condition = resolve_template(step['condition'], variables)
            if not evaluate_condition(condition, variables):
                msg = step.get('message', f'Assertion failed: {step["condition"]}')
                results.append({'step': step, 'result': {'error': msg}})
                return {'last_result': {'error': msg},
                        '_total_retries': total_retries_used, 'aborted': True}
            results.append({'step': step, 'result': {'asserted': True}})
            continue

        # --- Browser operations (with error recovery) ---
        resolved = _resolve_step(step, variables)
        try:
            result = _execute_browser_op(current_tab, op, resolved)
        except Exception as err:
            result, should_continue, total_retries_used = _handle_error_recovery(
                step, step_index, err, current_tab, variables, results,
                error_log, workflow_defaults, total_retries_used,
            )
            if not should_continue:
                results.append({'step': step, 'result': result})
                return {'last_result': result,
                        '_total_retries': total_retries_used, 'aborted': True}

        results.append({'step': step, 'result': result})
        last_result = result

        # If extract returned data, merge into variables
        if op == 'extract' and isinstance(result, dict):
            data = result.get('result', result)
            if isinstance(data, dict):
                variables.update(data)
            # Per-step save: "save" or "webhook" field on extract ops
            step_target = step.get('save') or step.get('webhook')
            if step_target and step.get('webhook'):
                step_target = 'webhook:' + step_target
            if step_target:
                save_output(data, step_target)

    return {'last_result': last_result, '_total_retries': total_retries_used}


def run_workflow(tab, app_name, workflow_name, inputs=None, output=None,
                 browser=None, credentials=None):
    """Execute a workflow against a live browser tab.

    Args:
        tab: pingos.Tab instance (used as default tab)
        app_name: e.g. "youtube"
        workflow_name: e.g. "search-and-play"
        inputs: dict of input variables, e.g. {"query": "ESP32 tutorial"}
        output: default save target, e.g. "results.json", "sqlite:db.db:table"
        browser: optional Browser instance for multi-tab workflows
        credentials: optional dict of credentials for auth flows

    Returns:
        dict with step results, final variables, and error log
    """
    workflow = load_workflow(app_name, workflow_name)
    variables = dict(inputs or {})
    results = []
    error_log = []
    workflow_defaults = workflow.get('onError', {})
    if isinstance(workflow_defaults, str):
        workflow_defaults = {'onError': workflow_defaults}

    # --- Auth check ---
    manifest = load_manifest(app_name)
    auth_config = manifest.get('auth')
    if auth_config:
        if not check_auth(tab, auth_config):
            creds = credentials or load_credentials(app_name)
            if not run_login(tab, auth_config, creds):
                raise RuntimeError(f'Authentication failed for {app_name}')

    # --- Multi-tab setup ---
    multi_tab = None
    tab_configs = workflow.get('tabs')
    if tab_configs and browser:
        multi_tab = MultiTabContext(browser, tab_configs)

    outcome = _run_steps(tab, workflow['steps'], variables, results, error_log,
                         workflow_defaults, 0, multi_tab=multi_tab, default_tab=tab)

    # Workflow-level default output
    wf_output = output or workflow.get('save')
    if wf_output:
        save_output(variables, wf_output)

    response = {'steps': results, 'variables': variables}
    if error_log:
        response['errors'] = error_log
    if outcome.get('aborted'):
        response['aborted'] = True
    return response
