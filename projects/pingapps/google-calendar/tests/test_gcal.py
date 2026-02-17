"""Tests for Google Calendar PingApp — workflow loading and template substitution."""

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
        assert manifest["name"] == "Google Calendar"

    def test_requires_auth(self):
        manifest = load_json(MANIFEST_PATH)
        assert manifest["required_auth"] is True

    def test_user_stories_reference_valid_workflows(self):
        manifest = load_json(MANIFEST_PATH)
        workflow_files = {p.stem for p in WORKFLOWS_DIR.glob("*.json")}
        for story in manifest["user_stories"]:
            assert story["workflow"] in workflow_files


class TestViewTodayWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "view-today.json")
        assert wf["name"] == "view-today"
        assert len(wf["steps"]) > 0

    def test_no_required_inputs(self):
        wf = load_json(WORKFLOWS_DIR / "view-today.json")
        required = [k for k, v in wf.get("inputs", {}).items() if v.get("required")]
        assert len(required) == 0

    def test_navigates_to_day_view(self):
        wf = load_json(WORKFLOWS_DIR / "view-today.json")
        nav_steps = [s for s in wf["steps"] if s["op"] == "navigate"]
        assert len(nav_steps) > 0
        assert "calendar.google.com" in nav_steps[0]["url"]
        assert "/day" in nav_steps[0]["url"]

    def test_all_steps_have_valid_ops(self):
        valid_ops = {"recon", "observe", "act", "extract", "click", "type", "press",
                     "read", "scroll", "wait", "screenshot", "eval", "navigate"}
        wf = load_json(WORKFLOWS_DIR / "view-today.json")
        for step in wf["steps"]:
            assert step["op"] in valid_ops


class TestCreateEventWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "create-event.json")
        assert wf["name"] == "create-event"
        assert len(wf["steps"]) > 0

    def test_required_inputs(self):
        wf = load_json(WORKFLOWS_DIR / "create-event.json")
        for field in ["title", "date", "start_time", "end_time"]:
            assert field in wf["inputs"], f"create-event should require '{field}'"
            assert wf["inputs"][field]["required"] is True

    def test_template_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "create-event.json")
        variables = {
            "title": "Team Standup",
            "date": "February 20, 2026",
            "start_time": "10:00 AM",
            "end_time": "10:30 AM"
        }
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        assert "Team Standup" in result_str
        assert "February 20, 2026" in result_str
        assert "10:00 AM" in result_str

    def test_no_unresolved_input_templates(self):
        wf = load_json(WORKFLOWS_DIR / "create-event.json")
        variables = {inp: f"test_{inp}" for inp in wf.get("inputs", {})}
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        input_keys = set(wf.get("inputs", {}).keys())
        unresolved = TEMPLATE_VAR_RE.findall(result_str)
        missed = [v for v in unresolved if v.split("[")[0].split(".")[0] in input_keys]
        assert len(missed) == 0, f"Unresolved input templates: {missed}"
