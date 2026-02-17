# PingOS Python SDK

Python client for the PingOS browser automation gateway.

## Installation

```bash
pip install -e packages/python-sdk
```

## Quick Start

```python
from pingos import Browser

browser = Browser()              # connects to localhost:3500
tab = browser.find('google')     # find tab by title/URL
print(tab.observe())             # see what's possible
tab.click('#search-btn')         # click elements
tab.type('hello', selector='input')  # type text
print(tab.read('h1'))            # read element text
```

## API Reference

### Browser

| Method | Description |
|--------|-------------|
| `Browser(host, port)` | Connect to gateway (default: localhost:3500) |
| `browser.health()` | Check gateway health |
| `browser.devices()` | List connected browser tabs |
| `browser.tab(device_id)` | Get Tab by device ID |
| `browser.find(query)` | Search tabs by title/URL, return first match |

### Tab

| Method | Description |
|--------|-------------|
| `tab.observe()` | Human-readable list of possible actions |
| `tab.recon()` | Raw page structure and elements |
| `tab.act(instruction)` | Execute natural-language instruction |
| `tab.click(selector)` | Click an element |
| `tab.type(text, selector)` | Type text into element |
| `tab.read(selector)` | Read element text content |
| `tab.press(key)` | Press keyboard key |
| `tab.scroll(direction, amount)` | Scroll the page |
| `tab.extract(schema)` | Extract structured data |
| `tab.eval(expression)` | Evaluate JavaScript |
| `tab.screenshot()` | Take a screenshot |
| `tab.wait(seconds)` | Wait (returns self for chaining) |
