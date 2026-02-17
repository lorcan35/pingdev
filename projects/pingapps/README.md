# PingApps

PingApps are **declarative browser automation workflows** powered by PingOS. Each PingApp targets a specific website and defines reusable workflows that automate common user tasks — searching, extracting data, filling forms, and navigating pages — all without writing imperative code.

## How It Works

A PingApp consists of:

- **`manifest.json`** — Declares the app's target site, user stories, auth requirements, and available workflows
- **`workflows/`** — JSON files that define step-by-step automation using PingOS ops
- **`tests/`** — Pytest-compatible tests for workflow loading and template validation

## Manifest Schema

Each `manifest.json` follows the schema defined in [`schema.json`](./schema.json). Key fields:

| Field | Description |
|-------|-------------|
| `name` | Human-readable app name |
| `version` | Semver version string |
| `url_patterns` | Glob patterns for target URLs |
| `description` | What the app does |
| `user_stories` | Array of user stories, each linked to a workflow |
| `required_auth` | Whether the site requires login |
| `tags` | Categorization tags |

## Workflow Format

Workflows are JSON files in the `workflows/` directory. Each workflow defines:

- **`steps`** — Ordered list of PingOS ops to execute
- **`inputs`** — Template variables the workflow accepts
- **`outputs`** — Data the workflow produces

### Available PingOS Ops

| Op | Description |
|----|-------------|
| `recon` | Analyze page structure and interactive elements |
| `observe` | Watch for DOM changes or state transitions |
| `act` | Perform a high-level action (click, type, select) |
| `extract` | Pull structured data from the page |
| `click` | Click a specific element |
| `type` | Type text into the focused element |
| `press` | Press a keyboard key (Enter, Tab, Escape, etc.) |
| `read` | Read text content from an element |
| `scroll` | Scroll the page or a container |
| `wait` | Wait for a duration or a condition |
| `screenshot` | Capture a screenshot |
| `eval` | Evaluate a JavaScript expression in the page |
| `navigate` | Navigate to a URL |

### Template Variables

Workflows use `{{variable}}` syntax for dynamic inputs:

- `{{query}}` — replaced with the value of the `query` input
- `{{results[0]}}` — access the first element of an array output
- `{{results[0].title}}` — access a nested property

## Creating a New PingApp

1. Create a directory under `projects/pingapps/` named after your site (lowercase, hyphenated):

   ```
   mkdir -p projects/pingapps/my-site/{workflows,tests}
   ```

2. Create `manifest.json` with your app metadata and user stories:

   ```json
   {
     "name": "My Site",
     "version": "0.1.0",
     "url_patterns": ["my-site.com/*"],
     "description": "Automate common tasks on My Site",
     "user_stories": [
       {
         "id": "ms-search",
         "as": "a user",
         "i_want": "to search for items",
         "so_that": "I can find what I need quickly",
         "workflow": "search"
       }
     ],
     "required_auth": false,
     "tags": ["search"]
   }
   ```

3. Create workflow JSON files in `workflows/`:

   ```json
   {
     "name": "search",
     "description": "Search for items on My Site",
     "steps": [
       { "op": "act", "instruction": "click the search box" },
       { "op": "type", "text": "{{query}}" },
       { "op": "press", "key": "Enter" },
       { "op": "wait", "seconds": 2 },
       { "op": "extract", "schema": { "results": ".result-item .title" } }
     ],
     "inputs": {
       "query": { "type": "string", "description": "Search query", "required": true }
     },
     "outputs": {
       "results": { "type": "array", "description": "Search results" }
     }
   }
   ```

4. Add tests in `tests/` to validate workflow loading and template substitution.

## Running a Workflow

```bash
pingos run <app> <workflow> [--input key=value ...]
```

Examples:

```bash
# Search YouTube for a topic
pingos run youtube search-and-play --input query="machine learning"

# Check Gmail inbox
pingos run gmail check-inbox

# Browse a subreddit
pingos run reddit browse-subreddit --input subreddit="programming"

# Search Amazon for a product
pingos run amazon search-product --input query="wireless headphones"
```
