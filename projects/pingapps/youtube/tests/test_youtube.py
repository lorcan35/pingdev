"""Tests for YouTube PingApp — workflow loading and template substitution."""

import json
import os
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
        assert MANIFEST_PATH.exists(), "manifest.json should exist"

    def test_manifest_valid_json(self):
        manifest = load_json(MANIFEST_PATH)
        assert isinstance(manifest, dict)

    def test_manifest_required_fields(self):
        manifest = load_json(MANIFEST_PATH)
        for field in ["name", "version", "url_patterns", "description", "user_stories"]:
            assert field in manifest, f"manifest must have '{field}'"

    def test_manifest_name(self):
        manifest = load_json(MANIFEST_PATH)
        assert manifest["name"] == "YouTube"

    def test_manifest_user_stories_reference_workflows(self):
        manifest = load_json(MANIFEST_PATH)
        workflow_files = {p.stem for p in WORKFLOWS_DIR.glob("*.json")}
        for story in manifest["user_stories"]:
            assert story["workflow"] in workflow_files, (
                f"User story '{story['id']}' references workflow '{story['workflow']}' "
                f"but no matching workflow file found. Available: {workflow_files}"
            )


class TestSearchAndPlayWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "search-and-play.json")
        assert wf["name"] == "search-and-play"
        assert len(wf["steps"]) > 0

    def test_workflow_has_required_fields(self):
        wf = load_json(WORKFLOWS_DIR / "search-and-play.json")
        assert "steps" in wf
        assert "inputs" in wf
        assert "outputs" in wf

    def test_template_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "search-and-play.json")
        result = substitute_templates(wf["steps"], {"query": "python tutorial"})
        type_steps = [s for s in result if s.get("op") == "type"]
        assert any("python tutorial" in s.get("text", "") for s in type_steps)

    def test_no_unresolved_templates_after_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "search-and-play.json")
        variables = {inp: f"test_{inp}" for inp in wf.get("inputs", {})}
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        unresolved = TEMPLATE_VAR_RE.findall(result_str)
        # Filter out output-only templates (from extract schemas)
        input_keys = set(wf.get("inputs", {}).keys())
        missed = [v for v in unresolved if v.split("[")[0].split(".")[0] in input_keys]
        assert len(missed) == 0, f"Unresolved input templates: {missed}"

    def test_all_steps_have_valid_ops(self):
        valid_ops = {"recon", "observe", "act", "extract", "click", "type", "press",
                     "read", "scroll", "wait", "screenshot", "eval", "navigate"}
        wf = load_json(WORKFLOWS_DIR / "search-and-play.json")
        for step in wf["steps"]:
            assert step["op"] in valid_ops, f"Invalid op: {step['op']}"


class TestExtractTrendingWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "extract-trending.json")
        assert wf["name"] == "extract-trending"
        assert len(wf["steps"]) > 0

    def test_no_required_inputs(self):
        wf = load_json(WORKFLOWS_DIR / "extract-trending.json")
        required = [k for k, v in wf.get("inputs", {}).items() if v.get("required")]
        assert len(required) == 0, "extract-trending should have no required inputs"

    def test_has_extract_step(self):
        wf = load_json(WORKFLOWS_DIR / "extract-trending.json")
        extract_steps = [s for s in wf["steps"] if s["op"] == "extract"]
        assert len(extract_steps) > 0, "Should have at least one extract step"
