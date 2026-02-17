"""Tests for Hacker News PingApp."""
import json
import os
import pytest

APPS_DIR = os.path.join(os.path.dirname(__file__), '..')


def test_manifest_loads():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    assert manifest['name'] == 'Hacker News'
    assert len(manifest['user_stories']) >= 3
    assert manifest['required_auth'] is False


def test_browse_front_page_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'browse-front-page.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'browse-front-page'
    ops = [s['op'] for s in wf['steps']]
    assert 'navigate' in ops
    assert 'extract' in ops


def test_read_comments_workflow():
    with open(os.path.join(APPS_DIR, 'workflows', 'read-comments.json')) as f:
        wf = json.load(f)
    assert wf['name'] == 'read-comments'
    assert any(s['op'] == 'click' for s in wf['steps'])


def test_user_stories_reference_workflows():
    with open(os.path.join(APPS_DIR, 'manifest.json')) as f:
        manifest = json.load(f)
    wf_dir = os.path.join(APPS_DIR, 'workflows')
    wf_files = {f[:-5] for f in os.listdir(wf_dir) if f.endswith('.json')}
    for story in manifest['user_stories']:
        assert story['workflow'] in wf_files, f"Story {story['id']} references missing workflow {story['workflow']}"
