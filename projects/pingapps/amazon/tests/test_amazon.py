"""Tests for Amazon PingApp — workflow loading and template substitution."""

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
        assert manifest["name"] == "Amazon"

    def test_does_not_require_auth(self):
        manifest = load_json(MANIFEST_PATH)
        assert manifest["required_auth"] is False

    def test_user_stories_reference_valid_workflows(self):
        manifest = load_json(MANIFEST_PATH)
        workflow_files = {p.stem for p in WORKFLOWS_DIR.glob("*.json")}
        for story in manifest["user_stories"]:
            assert story["workflow"] in workflow_files


class TestSearchProductWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "search-product.json")
        assert wf["name"] == "search-product"
        assert len(wf["steps"]) > 0

    def test_requires_query_input(self):
        wf = load_json(WORKFLOWS_DIR / "search-product.json")
        assert "query" in wf["inputs"]
        assert wf["inputs"]["query"]["required"] is True

    def test_template_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "search-product.json")
        result = substitute_templates(wf["steps"], {"query": "wireless headphones"})
        result_str = json.dumps(result)
        assert "wireless headphones" in result_str

    def test_extracts_prices(self):
        wf = load_json(WORKFLOWS_DIR / "search-product.json")
        extract_steps = [s for s in wf["steps"] if s["op"] == "extract"]
        assert len(extract_steps) > 0
        schemas = [s.get("schema", {}) for s in extract_steps]
        has_prices = any("prices" in schema for schema in schemas)
        assert has_prices, "search-product should extract prices"

    def test_all_steps_have_valid_ops(self):
        valid_ops = {"recon", "observe", "act", "extract", "click", "type", "press",
                     "read", "scroll", "wait", "screenshot", "eval", "navigate"}
        wf = load_json(WORKFLOWS_DIR / "search-product.json")
        for step in wf["steps"]:
            assert step["op"] in valid_ops


class TestPriceCheckWorkflow:
    def test_workflow_loads(self):
        wf = load_json(WORKFLOWS_DIR / "price-check.json")
        assert wf["name"] == "price-check"
        assert len(wf["steps"]) > 0

    def test_requires_product_url(self):
        wf = load_json(WORKFLOWS_DIR / "price-check.json")
        assert "product_url" in wf["inputs"]
        assert wf["inputs"]["product_url"]["required"] is True

    def test_template_substitution(self):
        wf = load_json(WORKFLOWS_DIR / "price-check.json")
        url = "https://www.amazon.com/dp/B0TEST123"
        result = substitute_templates(wf["steps"], {"product_url": url})
        result_str = json.dumps(result)
        assert url in result_str

    def test_extracts_price_and_availability(self):
        wf = load_json(WORKFLOWS_DIR / "price-check.json")
        extract_steps = [s for s in wf["steps"] if s["op"] == "extract"]
        assert len(extract_steps) > 0
        all_outputs = set()
        for s in extract_steps:
            all_outputs.update(s.get("schema", {}).keys())
        assert "price" in all_outputs, "Should extract price"
        assert "availability" in all_outputs, "Should extract availability"

    def test_no_unresolved_input_templates(self):
        wf = load_json(WORKFLOWS_DIR / "price-check.json")
        variables = {inp: f"https://test.com/{inp}" for inp in wf.get("inputs", {})}
        result = substitute_templates(wf["steps"], variables)
        result_str = json.dumps(result)
        input_keys = set(wf.get("inputs", {}).keys())
        unresolved = TEMPLATE_VAR_RE.findall(result_str)
        missed = [v for v in unresolved if v.split("[")[0].split(".")[0] in input_keys]
        assert len(missed) == 0, f"Unresolved input templates: {missed}"
