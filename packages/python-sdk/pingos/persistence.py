"""Data persistence layer for PingOS workflow outputs."""
import json
import csv
import sqlite3
import os
from urllib.request import urlopen, Request


def save(data, target, append=False):
    """Save data to target. Auto-detect format from target string.

    Targets:
    - "results.json" → JSON file
    - "results.csv" → CSV file
    - "sqlite:pingos.db:products" → SQLite table
    - "webhook:https://hooks.example.com/data" → POST to webhook
    - "stdout" or None → print to stdout
    """
    target_type, config = parse_target(target)
    if target_type == 'json':
        save_json(data, config['path'], append)
    elif target_type == 'csv':
        save_csv(data, config['path'], append)
    elif target_type == 'sqlite':
        save_sqlite(data, config['db_path'], config['table'])
    elif target_type == 'webhook':
        save_webhook(data, config['url'])
    else:
        save_stdout(data)


def parse_target(target):
    """Parse target string into (type, config) tuple."""
    if not target or target == 'stdout':
        return ('stdout', {})
    if target.startswith('sqlite:'):
        parts = target.split(':', 2)
        return ('sqlite', {
            'db_path': parts[1],
            'table': parts[2] if len(parts) > 2 else 'data',
        })
    if target.startswith('webhook:'):
        return ('webhook', {'url': target[8:]})
    if target.endswith('.json'):
        return ('json', {'path': target})
    if target.endswith('.csv'):
        return ('csv', {'path': target})
    # Default: JSON
    return ('json', {'path': target})


def save_json(data, filepath, append=False):
    """Save data as JSON file."""
    if append and os.path.isfile(filepath):
        with open(filepath, 'r') as f:
            existing = json.load(f)
        if isinstance(existing, list) and isinstance(data, list):
            existing.extend(data)
        elif isinstance(existing, list):
            existing.append(data)
        elif isinstance(existing, dict) and isinstance(data, dict):
            existing.update(data)
        else:
            existing = [existing, data]
        data = existing
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, default=str)


def save_csv(data, filepath, append=False):
    """Save data as CSV file. Data should be list of dicts or a single dict."""
    if isinstance(data, dict):
        rows = [data]
    elif isinstance(data, list):
        rows = data
    else:
        rows = [{'value': data}]

    if not rows:
        return

    fieldnames = list(rows[0].keys())
    write_header = not (append and os.path.isfile(filepath))
    mode = 'a' if append else 'w'

    with open(filepath, mode, newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def save_sqlite(data, db_path, table_name):
    """Save data to SQLite table. Auto-creates table from data keys."""
    if isinstance(data, dict):
        rows = [data]
    elif isinstance(data, list):
        rows = data
    else:
        rows = [{'value': data}]

    if not rows:
        return

    conn = sqlite3.connect(db_path)
    try:
        columns = list(rows[0].keys())
        col_types = []
        for col in columns:
            values = [r.get(col) for r in rows if r.get(col) is not None]
            if values and all(isinstance(v, int) for v in values):
                col_types.append('INTEGER')
            elif values and all(isinstance(v, (int, float)) for v in values):
                col_types.append('REAL')
            else:
                col_types.append('TEXT')

        col_defs = ', '.join(
            f'"{c}" {t}' for c, t in zip(columns, col_types)
        )
        conn.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" ({col_defs})')

        placeholders = ', '.join('?' for _ in columns)
        col_names = ', '.join(f'"{c}"' for c in columns)
        sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})'

        for row in rows:
            values = []
            for col in columns:
                v = row.get(col)
                if isinstance(v, (dict, list)):
                    v = json.dumps(v, default=str)
                values.append(v)
            conn.execute(sql, values)

        conn.commit()
    finally:
        conn.close()


def save_webhook(data, url):
    """POST data as JSON to webhook URL."""
    payload = json.dumps(data, default=str).encode('utf-8')
    req = Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    resp = urlopen(req)
    return {'status': resp.status, 'reason': resp.reason}


def save_stdout(data):
    """Print data to stdout as formatted JSON."""
    print(json.dumps(data, indent=2, default=str))
