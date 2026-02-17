"""Tests for Gmail PingApp — workflow loading and template substitution."""

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
        assert manifest["name"] == "Gmail"

    def test_requires_auth(self):
        manifest = load_json(MANIFEST_PATH)
        assert manifest["required_auth"] is True, "Gmail should require authentication"

    def test_user_stories_reference_valid_workflows(self):
        manifest = load_json(MANIFEST_PATH)
        workflow_files = {p.stem for p in WORKFLOWS_DIR.glob("*.json")}
        for story in manifest["user_stories"]:
            assert story["workflow"] in workflow_files


class TestCheckInboxWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "check-inbox.json")
        assert wf["name"] == "check-inbox"
        assert len(wf["steps"]) > 0

    def test_no_required_inputs(self):
        wf = load_json(WORKFLOWS_DIR / "check-inbox.json")
        required = [k for k, v in wf.get("inputs", {}).items() if v.get("required")]
        assert len(required) == 0, "check-inbox should have no required inputs"

    def test_navigates_to_gmail(self):
        wf = load_json(WORKFLOWS_DIR / "check-inbox.json")
        nav_steps = [s for s in wf["steps"] if s["op"] == "navigate"]
        assert len(nav_steps) > 0
        assert "mail.google.com" in nav_steps[0]["url"]

    def test_has_extract_step(self):
        wf = load_json(WORKFLOWS_DIR / "check-inbox.json")
        extract_steps = [s for s in wf["steps"] if s["op"] == "extract"]
        assert len(extract_steps) > 0

    def test_all_steps_have_valid_ops(self):
        valid_ops = {"recon", "observe", "act", "extract", "click", "type", "press",
                     "read", "scroll", "wait", "screenshot", "eval", "navigate"}
        wf = load_json(WORKFLOWS_DIR / "check-inbox.json")
        for step in wf["steps"]:
            assert step["op"] in valid_ops


class TestComposeEmailWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "compose-email.json")
        assert wf["name"] == "compose-email"
        assert len(wf["steps"]) > 0

    def test_required_inputs(self):
        wf = load_json(WORKFLOWS_DIR / "compose-email.json")
        assert "to" in wf["inputs"]
        assert "subject" in wf["inputs"]
        assert "body" in wf["inputs"]
        for inp in ["to", "subject", "body"]:
            assert wf["inputs"][inp]["required"] is True

    def test_template_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "compose-email.json")
        variables = {
            "to": "test@example.com",
            "subject": "Hello World",
            "body": "This is a test email."
        }
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        assert "test@example.com" in result_str
        assert "Hello World" in result_str
        assert "This is a test email." in result_str

    def test_no_unresolved_input_templates(self):
        wf = load_json(WORKFLOWS_DIR / "compose-email.json")
        variables = {inp: f"test_{inp}" for inp in wf.get("inputs", {})}
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        input_keys = set(wf.get("inputs", {}).keys())
        unresolved = TEMPLATE_VAR_RE.findall(result_str)
        missed = [v for v in unresolved if v.split("[")[0].split(".")[0] in input_keys]
        assert len(missed) == 0, f"Unresolved input templates: {missed}"
