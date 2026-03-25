# Python SDK

> **Package**: `packages/python-sdk`
> **Requires**: Python 3.8+
> **Dependencies**: None (stdlib only — uses `urllib.request`)

The PingOS Python SDK provides a high-level interface for controlling browser tabs, extracting data, and running PingApp workflows from Python scripts.

## Installation

```bash
cd packages/python-sdk
pip install -e .
```

## Quick Start

```python
from pingos import Browser

# Connect to the PingOS gateway
b = Browser()

# Check gateway health
print(b.health())
# {'status': 'ok', 'version': '0.1.0', ...}

# Find a tab by URL or title
tab = b.find('amazon')
print(tab)
# Tab(chrome-123 "Amazon.com")

# Extract data using natural language
data = tab.extract(query='all product titles and prices')
print(data)
```

## Core Classes

### `Browser`

The main entry point. Connects to the gateway (default: `localhost:3500`).

```python
from pingos import Browser

b = Browser(host='localhost', port=3500)
```

| Method | Description |
|--------|-------------|
| `b.health()` | Check gateway health |
| `b.devices()` | List all connected browser tabs |
| `b.tab(device_id)` | Get a `Tab` instance by device ID |
| `b.find(query)` | Search tabs by title/URL, return first match |
| `b.functions(app_name=None)` | List callable tab functions |
| `b.call(app_name, function, **params)` | Call a tab function |
| `b.pipeline(definition)` | Execute a cross-tab pipeline |
| `b.pipe(pipe_str)` | Execute pipe shorthand |
| `b.templates()` | List saved extraction templates |
| `b.get_template(domain)` | Get a template for a domain |
| `b.delete_template(domain)` | Delete a saved template |
| `b.import_template(template)` | Import a template dict |
| `b.export_template(domain)` | Export a template |

### `Tab`

Represents a single browser tab. All operations are executed via the gateway.

```python
tab = b.find('amazon')
# or
tab = b.tab('chrome-12345')
```

#### Extraction

```python
# Schema-based extraction
data = tab.extract(schema={'title': 'h1', 'price': '.price'})

# Zero-config (auto-detect)
data = tab.extract()

# Natural language query
data = tab.extract(query='all product prices')

# Visual extraction (screenshot-based)
data = tab.extract(strategy='visual')

# Paginated extraction
data = tab.extract(schema={'title': 'h2'}, paginate=True, max_pages=5)

# With fallback
data = tab.extract(schema={'title': 'h1'}, fallback='visual')

# Semantic extraction (LLM-generated selectors)
data = tab.extract_semantic('product ratings and review counts')

# Learn a reusable template
tab.learn_template(schema={'title': '#productTitle', 'price': '.a-price'})
```

#### Interaction

```python
tab.click('.add-to-cart')
tab.type('laptop stand', selector='#search-input')
tab.press('Enter')
tab.scroll('down', amount=3)
tab.fill({'Email': 'user@example.com', 'Password': 'secret'})
tab.select_option('#color-picker', text='Blue')
tab.hover('.tooltip-trigger', duration_ms=500)
```

#### Navigation

```python
tab.smart_navigate('checkout')
tab.smart_navigate('https://example.com/page')
```

#### Page Analysis

```python
# Get page type and suggested schemas (no LLM needed)
info = tab.discover()
# {'pageType': 'product', 'confidence': 0.9, 'schemas': {...}}

# Get possible actions on the page
actions = tab.observe()

# Page reconnaissance
recon = tab.recon()

# Natural language question about the page
answer = tab.query('What is the current price?')

# LLM suggestion
suggestion = tab.suggest('How should I extract the reviews?')
```

#### Reading & Assertions

```python
# Read text from an element
text = tab.read('.product-title')

# Diff against previous extraction
changes = tab.diff(schema={'price': '.price', 'stock': '.availability'})

# Run page assertions
result = tab.assert_page([
    {'type': 'exists', 'selector': '.product-title'},
    {'type': 'textContains', 'selector': '.price', 'expected': '$'},
])
```

#### Dialogs & Pagination

```python
# Detect and dismiss modals/cookie banners
tab.dialog(action='dismiss')

# Auto-detect pagination
page_info = tab.paginate(action='detect')
tab.paginate(action='next')
tab.paginate(action='goto', page=3)
```

#### Tables

```python
# Extract tabular data
tables = tab.table()
# {'tables': [{'headers': [...], 'rows': [...], 'rowCount': 25}]}

# Extract a specific table
table = tab.table(selector='#results-table')
```

#### Advanced

```python
# Evaluate arbitrary JavaScript
result = tab.eval('document.querySelectorAll("a").length')

# Take a screenshot
screenshot = tab.screenshot()

# Watch for live changes (returns SSE generator)
for event in tab.watch('.stock-price', interval=5000):
    print(event['changes'])

tab.unwatch(watch_id)

# Capture page content
dom = tab.capture(format='dom')

# Network interception
tab.network(action='start', filter={'url': 'api.example.com'})
# ... interact ...
requests = tab.network(action='list')
tab.network(action='stop')

# Browser storage
cookies = tab.storage(action='list', store='cookies')
tab.storage(action='set', store='local', key='theme', value='dark')

# File upload/download
tab.upload('#file-input', '/path/to/document.pdf')
tab.download(url='https://example.com/report.csv', save_path='report.csv')

# Visual annotations
tab.annotate([
    {'selector': '.price', 'label': 'Price', 'color': 'green', 'style': 'box'},
])

# Wait for conditions
tab.wait_for('visible', selector='.results')
tab.wait_for('text', selector='#status', text='Complete')
tab.wait_for('networkIdle', timeout=10000)
```

#### Recording

```python
# Record a workflow
tab.record_start()
# ... interact manually or via API ...
tab.record_stop()

# Export the recording
recording = tab.export_recording(name='my-workflow')

# Replay a recording
result = tab.replay(recording, speed=1.0)

# Generate a PingApp from a recording
app_def = tab.generate_pingapp(recording, name='my-app')
```

### `GatewayClient`

Low-level HTTP client. You typically do not use this directly — `Browser` and `Tab` wrap it.

```python
from pingos import GatewayClient

client = GatewayClient(host='localhost', port=3500)
result = client._request('GET', '/v1/health')
result = client._request('POST', '/v1/dev/chrome-123/extract', body={'query': 'prices'})
```

## PingApp Workflows

The SDK can load and run PingApp workflow definitions from `projects/pingapps/`.

```python
from pingos import Browser
from pingos.apps import list_apps, run_workflow

# List available PingApps
for app in list_apps():
    print(f"{app['name']}: {app['description']} ({app['workflows']})")

# Run a workflow
b = Browser()
tab = b.find('aliexpress')

result = run_workflow(
    tab,
    app_name='aliexpress',
    workflow_name='search',
    inputs={'query': 'ESP32 board'},
    output='results.json',       # Save to file
)

print(result['steps'])       # Step-by-step results
print(result['variables'])   # Final variable state
if result.get('errors'):
    print(result['errors'])  # Error recovery log
```

### Output Targets

The `output` parameter supports multiple formats:

```python
# JSON file
run_workflow(tab, 'app', 'wf', output='results.json')

# CSV file
run_workflow(tab, 'app', 'wf', output='results.csv')

# SQLite database
run_workflow(tab, 'app', 'wf', output='sqlite:data.db:products')

# Webhook
run_workflow(tab, 'app', 'wf', output='webhook:https://hooks.example.com/data')

# Stdout
run_workflow(tab, 'app', 'wf', output='stdout')
```

### Authentication

Workflows that require login will automatically check auth state and run the login flow if needed.

Credentials are loaded from (in priority order):
1. Environment variables (e.g., `ALIEXPRESS_EMAIL`, `ALIEXPRESS_PASSWORD`)
2. `~/.pingos/credentials.json`
3. Credentials dict passed to `run_workflow()`

```python
run_workflow(
    tab, 'myapp', 'checkout',
    credentials={'EMAIL': 'user@example.com', 'PASSWORD': 'secret'},
)
```

## Multi-Tab Workflows

For workflows that span multiple browser tabs:

```python
from pingos import Browser, MultiTabContext

b = Browser()

ctx = MultiTabContext(b, {
    'sheets': {'url': 'https://docs.google.com/spreadsheets/d/...'},
    'gmail': {'url': 'https://mail.google.com'},
})

sheets = ctx.get_tab('sheets')
gmail = ctx.get_tab('gmail')

data = sheets.extract(schema={'names': 'td:nth-child(1)', 'emails': 'td:nth-child(2)'})
gmail.type(data['result']['emails'][0], selector='[name="to"]')
```

## Pipelines

Execute cross-tab operations in sequence or parallel:

```python
# Full pipeline definition
result = b.pipeline({
    'name': 'price-compare',
    'steps': [
        {'id': 'amazon', 'tab': 'amazon', 'op': 'extract', 'schema': {'price': '.a-price'}},
        {'id': 'ebay', 'tab': 'ebay', 'op': 'extract', 'schema': {'price': '.s-item__price'}},
        {'id': 'compare', 'op': 'transform', 'template': 'Amazon: {{amazon.price}}, eBay: {{ebay.price}}'},
    ],
})

# Pipe shorthand
result = b.pipe("extract:amazon:.price | extract:ebay:.price")
```

## Template Engine

The SDK includes a template engine for resolving variables in workflow definitions:

```python
from pingos.template_engine import resolve_template, evaluate_condition

# Variable substitution
text = resolve_template("Search for {{query}} on page {{page}}", {
    'query': 'laptop',
    'page': 2,
})
# "Search for laptop on page 2"

# Condition evaluation
result = evaluate_condition("{{results.length}} > 0", {'results': [1, 2, 3]})
# True

result = evaluate_condition("{{status}} == 'complete' and {{count}} >= 5", {
    'status': 'complete',
    'count': 10,
})
# True
```

Supported operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `matches` (regex), `and`, `or`, `not`.

## Error Handling

The SDK raises `RuntimeError` on gateway connection errors and HTTP failures:

```python
from pingos import Browser

b = Browser()

try:
    tab = b.find('nonexistent')
    if tab is None:
        print('No matching tab found')
except RuntimeError as e:
    print(f'Gateway error: {e}')
```
