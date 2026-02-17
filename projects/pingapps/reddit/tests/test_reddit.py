"""Tests for Reddit PingApp — workflow loading and template substitution."""

import json
import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = APP_DIR / "workflows"
MANIFEST_PATH = APP_DIR / "manifest.json"

TEMPLATE_VAR_RE = re.compile(r"\{\{(\w+(?:\[\d+\])?(?:\.\w+)?)\}\}")


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def substitute_templates(obj, variables: dict):
    """Recursively substitute {{var}} templates in a JSON-like object."""
    if isinstance(obj, str):
        for key, value in variables.items():
            obj = obj.replace(f"{{{{{key}}}}}", str(value))
        return obj
    elif isinstance(obj, list):
        return [substitute_templates(item, variables) for item in obj]
    elif isinstance(obj, dict):
        return {k: substitute_templates(v, variables) for k, v in obj.items()}
    return obj


class TestManifest:
    def test_manifest_exists(self):
        assert MANIFEST_PATH.exists()

    def test_manifest_valid_json(self):
        manifest = load_json(MANIFEST_PATH)
        assert isinstance(manifest, dict)

    def test_manifest_required_fields(self):
        manifest = load_json(MANIFEST_PATH)
        for field in ["name", "version", "url_patterns", "description", "user_stories"]:
            assert field in manifest

    def test_manifest_name(self):
        manifest = load_json(MANIFEST_PATH)
        assert manifest["name"] == "Reddit"

    def test_user_stories_reference_valid_workflows(self):
        manifest = load_json(MANIFEST_PATH)
        workflow_files = {p.stem for p in WORKFLOWS_DIR.glob("*.json")}
        for story in manifest["user_stories"]:
            assert story["workflow"] in workflow_files


class TestBrowseSubredditWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "browse-subreddit.json")
        assert wf["name"] == "browse-subreddit"
        assert len(wf["steps"]) > 0

    def test_template_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "browse-subreddit.json")
        result = substitute_templates(wf["steps"], {"subreddit": "programming"})
        result_str = json.dumps(result)
        assert "programming" in result_str

    def test_navigate_step_uses_subreddit_template(self):
        wf = load_json(WORKFLOWS_DIR / "browse-subreddit.json")
        nav_steps = [s for s in wf["steps"] if s["op"] == "navigate"]
        assert len(nav_steps) > 0
        assert "{{subreddit}}" in nav_steps[0]["url"]

    def test_all_steps_have_valid_ops(self):
        valid_ops = {"recon", "observe", "act", "extract", "click", "type", "press",
                     "read", "scroll", "wait", "screenshot", "eval", "navigate"}
        wf = load_json(WORKFLOWS_DIR / "browse-subreddit.json")
        for step in wf["steps"]:
            assert step["op"] in valid_ops


class TestExtractTopPostsWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "extract-top-posts.json")
        assert wf["name"] == "extract-top-posts"

    def test_template_substitution_with_defaults(self):
        wf = load_json(WORKFLOWS_DIR / "extract-top-posts.json")
        variables = {"subreddit": "python", "time_period": "month"}
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        assert "python" in result_str
        assert "month" in result_str

    def test_has_scroll_step(self):
        wf = load_json(WORKFLOWS_DIR / "extract-top-posts.json")
        scroll_steps = [s for s in wf["steps"] if s["op"] == "scroll"]
        assert len(scroll_steps) > 0, "Should scroll to load more posts"

    def test_time_period_has_default(self):
        wf = load_json(WORKFLOWS_DIR / "extract-top-posts.json")
        tp = wf["inputs"]["time_period"]
        assert "default" in tp, "time_period should have a default value"
