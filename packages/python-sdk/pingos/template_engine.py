"""Template engine — condition evaluation, template resolution, and expression parsing."""
import re
import operator


# ---------------------------------------------------------------------------
# Template Resolution (enhanced)
# ---------------------------------------------------------------------------

def _lookup(ref, variables):
    """Resolve a dotted/indexed reference against a variables dict.

    Examples: "query", "titles[0]", "result.title", "items[2].name",
              "results.length", "arr[0].key"
    """
    parts = re.split(r'\.', ref)
    current = variables
    for part in parts:
        # Handle .length pseudo-property
        if part == 'length' and isinstance(current, (list, str, dict)):
            return len(current)
        # Check for array index: name[0]
        idx_match = re.match(r'^(\w+)\[(\d+)\]$', part)
        if idx_match:
            key, idx = idx_match.group(1), int(idx_match.group(2))
            if key == 'length':
                raise KeyError('length is not subscriptable')
            current = current[key][idx]
        else:
            current = current[part]
    return current


def resolve_template(text, variables):
    """Replace {{var}} placeholders in text with actual values.

    Supports:
    - {{query}} — simple variable lookup
    - {{titles[0]}} — array index access
    - {{result.key}} — nested dict access
    - {{result.key[1]}} — combined dot + index
    - {{results.length}} — length of list/string/dict
    - {{arr[0].key}} — index then dot access
    """
    if not isinstance(text, str):
        return text

    def _resolve_ref(match):
        ref = match.group(1).strip()
        try:
            value = _lookup(ref, variables)
            if value is None:
                return match.group(0)  # leave unresolved
            return str(value)
        except (KeyError, IndexError, TypeError):
            return match.group(0)  # leave unresolved

    return re.sub(r'\{\{(.+?)\}\}', _resolve_ref, text)


def resolve_value(text, variables):
    """Resolve a template string and attempt to return a typed value.

    If the entire string is a single {{ref}}, return the raw Python value
    (preserving lists, dicts, ints, etc.). Otherwise, return the string result.
    """
    if not isinstance(text, str):
        return text
    single = re.fullmatch(r'\{\{(.+?)\}\}', text.strip())
    if single:
        ref = single.group(1).strip()
        try:
            return _lookup(ref, variables)
        except (KeyError, IndexError, TypeError):
            return text
    return resolve_template(text, variables)


# ---------------------------------------------------------------------------
# Condition Evaluation
# ---------------------------------------------------------------------------

_COMPARE_OPS = {
    '==': operator.eq,
    '!=': operator.ne,
    '>': operator.gt,
    '<': operator.lt,
    '>=': operator.ge,
    '<=': operator.le,
}


def _coerce(val):
    """Try to coerce a string token to int, float, bool, or None."""
    if val == 'true':
        return True
    if val == 'false':
        return False
    if val == 'none' or val == 'null':
        return None
    # Strip surrounding quotes
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
        return val[1:-1]
    try:
        return int(val)
    except ValueError:
        pass
    try:
        return float(val)
    except ValueError:
        pass
    return val


def _resolve_token(token, variables):
    """Resolve a single token — either a {{ref}} or a literal."""
    token = token.strip()
    m = re.fullmatch(r'\{\{(.+?)\}\}', token)
    if m:
        ref = m.group(1).strip()
        try:
            return _lookup(ref, variables)
        except (KeyError, IndexError, TypeError):
            return None
    return _coerce(token)


def _eval_simple(condition, variables):
    """Evaluate a single comparison expression (no and/or/not)."""
    condition = condition.strip()

    # "contains" operator
    m = re.match(r'^(.+?)\s+contains\s+(.+)$', condition)
    if m:
        left = _resolve_token(m.group(1), variables)
        right = _resolve_token(m.group(2), variables)
        if left is None:
            return False
        return right in left

    # "matches" operator (regex)
    m = re.match(r'^(.+?)\s+matches\s+(.+)$', condition)
    if m:
        left = _resolve_token(m.group(1), variables)
        right = _resolve_token(m.group(2), variables)
        if left is None or right is None:
            return False
        return bool(re.search(str(right), str(left)))

    # Comparison operators: ==, !=, >=, <=, >, <
    for op_str in ('>=', '<=', '!=', '==', '>', '<'):
        parts = condition.split(op_str, 1)
        if len(parts) == 2:
            left = _resolve_token(parts[0], variables)
            right = _resolve_token(parts[1], variables)
            try:
                return _COMPARE_OPS[op_str](left, right)
            except TypeError:
                return False

    # Bare truthy check
    val = _resolve_token(condition, variables)
    return bool(val)


def evaluate_condition(condition, variables):
    """Evaluate a condition string against variables.

    Supports:
    - Comparisons: ==, !=, >, <, >=, <=
    - Keywords: contains, matches (regex)
    - Logical: and, or, not
    - Template refs: {{var}}, {{obj.key}}, {{arr.length}}
    - Literals: numbers, quoted strings, true/false/none

    Examples:
        evaluate_condition("{{results.length}} > 0", {"results": [1,2]})  → True
        evaluate_condition("{{title}} != ''", {"title": "Hello"})  → True
        evaluate_condition("{{x}} > 5 and {{y}} < 10", {"x": 7, "y": 3})  → True
    """
    condition = condition.strip()

    # Handle "not" prefix
    if condition.startswith('not '):
        return not evaluate_condition(condition[4:], variables)

    # Split on " or " (lowest precedence)
    # Careful: don't split inside {{...}}
    or_parts = _split_logical(condition, ' or ')
    if len(or_parts) > 1:
        return any(evaluate_condition(p, variables) for p in or_parts)

    # Split on " and "
    and_parts = _split_logical(condition, ' and ')
    if len(and_parts) > 1:
        return all(evaluate_condition(p, variables) for p in and_parts)

    # Resolve templates in the condition before evaluating
    resolved = resolve_template(condition, variables)
    return _eval_simple(resolved, variables)


def _split_logical(condition, sep):
    """Split condition on a logical separator, but not inside {{ }}."""
    parts = []
    depth = 0
    current = ''
    i = 0
    while i < len(condition):
        if condition[i:i+2] == '{{':
            depth += 1
            current += '{{'
            i += 2
            continue
        if condition[i:i+2] == '}}':
            depth -= 1
            current += '}}'
            i += 2
            continue
        if depth == 0 and condition[i:i+len(sep)] == sep:
            parts.append(current)
            current = ''
            i += len(sep)
            continue
        current += condition[i]
        i += 1
    parts.append(current)
    return parts if len(parts) > 1 else [condition]
