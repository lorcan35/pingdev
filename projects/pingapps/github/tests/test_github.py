"""Tests for GitHub PingApp."""
import json
import os
import pytest

APPS_DIR = os.path.join(os.path.dirname(__file__), '..')


def test_manifest_loads():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    assert manifest['name'] == 'GitHub'
    assert len(manifest['user_stories']) >= 3
    assert manifest['required_auth'] is False


def test_search_repos_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'search-repos.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'search-repos'
    assert 'query' in wf['inputs']
    assert any('{{query}}' in s.get('url', '') for s in wf['steps'])


def test_browse_issues_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'browse-issues.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'browse-issues'
    assert 'repo' in wf['inputs']


def test_user_stories_reference_workflows():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    wf_dir = os.path.join(APPS_DIR, 'workflows')
    wf_files = {f[:-5] for f in os.listdir(wf_dir) if f.endswith('.json')}
    for story in manifest['user_stories']:
        assert story['workflow'] in wf_files
