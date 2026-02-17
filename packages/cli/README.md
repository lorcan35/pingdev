# PingOS CLI

Command-line interface for the PingOS gateway. Control browser tabs from the terminal.

## Install

```bash
pip install -e packages/cli/
```

## Usage

```bash
# List connected devices
pingos devices

# Run recon (auto-detects device if only one is connected)
pingos recon
pingos recon <device-id>

# Execute a natural-language instruction
pingos act "click the login button"
pingos act <device-id> "type hello into the search box"

# Extract structured data
pingos extract '{"title": "string", "price": "number"}'
pingos extract <device-id> '{"items": [{"name": "string"}]}'

# Take a screenshot (saves PNG to current directory)
pingos screenshot
pingos screenshot <device-id>
```

## Options

```
--host TEXT    Gateway host (default: localhost)
--port INT     Gateway port (default: 3500)
--json         Output raw JSON instead of formatted text
```

## Examples

```bash
# Use a remote gateway
pingos --host 192.168.1.10 --port 3500 devices

# Get raw JSON output
pingos --json devices
pingos --json recon

# Pipe extract results to jq
pingos --json extract '{"title": "string"}' | jq .result
```
