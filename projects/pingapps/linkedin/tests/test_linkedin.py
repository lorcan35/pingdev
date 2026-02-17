"""Tests for LinkedIn PingApp."""
import json
import os
import pytest

APPS_DIR = os.path.join(os.path.dirname(__file__), '..')


def test_manifest_loads():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    assert manifest['name'] == 'LinkedIn'
    assert len(manifest['user_stories']) >= 3
    assert manifest['required_auth'] is True


def test_search_people_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'search-people.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'search-people'
    assert 'query' in wf['inputs']


def test_browse_feed_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'browse-feed.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'browse-feed'
    assert any(s['op'] == 'observe' for s in wf['steps'])


def test_user_stories_reference_workflows():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    wf_dir = os.path.join(APPS_DIR, 'workflows')
    wf_files = {f[:-5] for f in os.listdir(wf_dir) if f.endswith('.json')}
    for story in manifest['user_stories']:
        assert story['workflow'] in wf_files
