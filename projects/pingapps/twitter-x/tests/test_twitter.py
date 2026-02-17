"""Tests for Twitter/X PingApp."""
import json
import os
import pytest

APPS_DIR = os.path.join(os.path.dirname(__file__), '..')


def test_manifest_loads():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    assert manifest['name'] == 'Twitter/X'
    assert len(manifest['user_stories']) >= 3
    assert manifest['required_auth'] is True


def test_search_tweets_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'search-tweets.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'search-tweets'
    assert 'query' in wf['inputs']
    # Should have login detection
    assert any(s['op'] == 'eval' for s in wf['steps'])


def test_read_thread_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'read-thread.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'read-thread'
    assert 'username' in wf['inputs']


def test_user_stories_reference_workflows():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    wf_dir = os.path.join(APPS_DIR, 'workflows')
    wf_files = {f[:-5] for f in os.listdir(wf_dir) if f.endswith('.json')}
    for story in manifest['user_stories']:
        assert story['workflow'] in wf_files
