/**
 * WorkflowEngine — condition evaluation, template resolution, and workflow ops.
 *
 * TypeScript counterpart of packages/python-sdk/pingos/template_engine.py + workflow runner.
 * Supports: if, loop, set, assert, error recovery (retry/skip/fallback/abort).
 */
// ---------------------------------------------------------------------------
// Template Resolution
// ---------------------------------------------------------------------------
function lookup(ref, variables) {
    const parts = ref.split('.');
    let current = variables;
    for (const part of parts) {
        if (current == null)
            throw new Error(`Cannot access '${part}' of null/undefined`);
        // Handle .length pseudo-property
        if (part === 'length' && (Array.isArray(current) || typeof current === 'string')) {
            return current.length;
        }
        if (part === 'length' && typeof current === 'object') {
            return Object.keys(current).length;
        }
        // Check for array index: name[0]
        const idxMatch = part.match(/^(\w+)\[(\d+)]$/);
        if (idxMatch) {
            const key = idxMatch[1];
            const idx = parseInt(idxMatch[2], 10);
            const obj = current[key];
            if (!Array.isArray(obj))
                throw new Error(`${key} is not an array`);
            current = obj[idx];
        }
        else {
            current = current[part];
        }
    }
    return current;
}
export function resolveTemplate(text, variables) {
    return text.replace(/\{\{(.+?)\}\}/g, (match, ref) => {
        ref = ref.trim();
        try {
            const value = lookup(ref, variables);
            if (value == null)
                return match;
            return String(value);
        }
        catch {
            return match;
        }
    });
}
export function resolveValue(text, variables) {
    const single = text.trim().match(/^\{\{(.+?)\}\}$/);
    if (single) {
        const ref = single[1].trim();
        try {
            return lookup(ref, variables);
        }
        catch {
            return text;
        }
    }
    return resolveTemplate(text, variables);
}
// ---------------------------------------------------------------------------
// Condition Evaluation
// ---------------------------------------------------------------------------
const COMPARE_OPS = {
    '==': (a, b) => a === b || String(a) === String(b),
    '!=': (a, b) => a !== b && String(a) !== String(b),
    '>': (a, b) => Number(a) > Number(b),
    '<': (a, b) => Number(a) < Number(b),
    '>=': (a, b) => Number(a) >= Number(b),
    '<=': (a, b) => Number(a) <= Number(b),
};
function coerce(val) {
    if (val === 'true')
        return true;
    if (val === 'false')
        return false;
    if (val === 'none' || val === 'null')
        return null;
    // Strip quotes
    if (val.length >= 2 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) {
        return val.slice(1, -1);
    }
    const n = Number(val);
    if (!isNaN(n) && val.trim() !== '')
        return n;
    return val;
}
function resolveToken(token, variables) {
    token = token.trim();
    const m = token.match(/^\{\{(.+?)\}\}$/);
    if (m) {
        const ref = m[1].trim();
        try {
            return lookup(ref, variables);
        }
        catch {
            return null;
        }
    }
    return coerce(token);
}
function evalSimple(condition, variables) {
    condition = condition.trim();
    // "contains" operator
    const containsMatch = condition.match(/^(.+?)\s+contains\s+(.+)$/);
    if (containsMatch) {
        const left = resolveToken(containsMatch[1], variables);
        const right = resolveToken(containsMatch[2], variables);
        if (left == null)
            return false;
        if (typeof left === 'string')
            return left.includes(String(right));
        if (Array.isArray(left))
            return left.includes(right);
        return false;
    }
    // "matches" operator (regex)
    const matchesMatch = condition.match(/^(.+?)\s+matches\s+(.+)$/);
    if (matchesMatch) {
        const left = resolveToken(matchesMatch[1], variables);
        const right = resolveToken(matchesMatch[2], variables);
        if (left == null || right == null)
            return false;
        try {
            return new RegExp(String(right)).test(String(left));
        }
        catch {
            return false;
        }
    }
    // Comparison operators
    for (const opStr of ['>=', '<=', '!=', '==', '>', '<']) {
        const idx = condition.indexOf(opStr);
        if (idx !== -1) {
            const left = resolveToken(condition.slice(0, idx), variables);
            const right = resolveToken(condition.slice(idx + opStr.length), variables);
            try {
                return COMPARE_OPS[opStr](left, right);
            }
            catch {
                return false;
            }
        }
    }
    // Bare truthy check
    const val = resolveToken(condition, variables);
    return Boolean(val);
}
function splitLogical(condition, sep) {
    const parts = [];
    let depth = 0;
    let current = '';
    let i = 0;
    while (i < condition.length) {
        if (condition.slice(i, i + 2) === '{{') {
            depth++;
            current += '{{';
            i += 2;
            continue;
        }
        if (condition.slice(i, i + 2) === '}}') {
            depth--;
            current += '}}';
            i += 2;
            continue;
        }
        if (depth === 0 && condition.slice(i, i + sep.length) === sep) {
            parts.push(current);
            current = '';
            i += sep.length;
            continue;
        }
        current += condition[i];
        i++;
    }
    parts.push(current);
    return parts.length > 1 ? parts : [condition];
}
export function evaluateCondition(condition, variables) {
    condition = condition.trim();
    // Handle "not" prefix
    if (condition.startsWith('not ')) {
        return !evaluateCondition(condition.slice(4), variables);
    }
    // Split on " or " (lowest precedence)
    const orParts = splitLogical(condition, ' or ');
    if (orParts.length > 1) {
        return orParts.some(p => evaluateCondition(p, variables));
    }
    // Split on " and "
    const andParts = splitLogical(condition, ' and ');
    if (andParts.length > 1) {
        return andParts.every(p => evaluateCondition(p, variables));
    }
    // Resolve templates then evaluate
    const resolved = resolveTemplate(condition, variables);
    return evalSimple(resolved, variables);
}
export class WorkflowEngine {
    variables;
    results = [];
    errorLog = [];
    defaults;
    totalRetriesUsed = 0;
    executor;
    constructor(executor, inputs, defaults) {
        this.executor = executor;
        this.variables = { ...(inputs || {}) };
        this.defaults = defaults || {};
    }
    /** Run a list of steps. Returns the workflow result. */
    async run(steps) {
        const outcome = await this.runSteps(steps);
        const response = {
            steps: this.results,
            variables: this.variables,
        };
        if (this.errorLog.length > 0) {
            response.errors = this.errorLog;
        }
        if (outcome.aborted) {
            response.aborted = true;
        }
        return response;
    }
    resolveStep(step) {
        const resolved = {};
        for (const [k, v] of Object.entries(step)) {
            if (typeof v === 'string') {
                resolved[k] = resolveTemplate(v, this.variables);
            }
            else if (v && typeof v === 'object' && !Array.isArray(v)) {
                const obj = {};
                for (const [sk, sv] of Object.entries(v)) {
                    obj[sk] = typeof sv === 'string' ? resolveTemplate(sv, this.variables) : sv;
                }
                resolved[k] = obj;
            }
            else {
                resolved[k] = v;
            }
        }
        return resolved;
    }
    async runSteps(steps) {
        let lastResult = null;
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
            const step = steps[stepIndex];
            const op = step.op;
            // --- Conditional: if ---
            if (op === 'if') {
                const condition = resolveTemplate(step.condition, this.variables);
                const taken = evaluateCondition(condition, this.variables);
                const branch = taken ? (step.then || []) : (step.else || []);
                if (branch.length > 0) {
                    const sub = await this.runSteps(branch);
                    lastResult = sub.lastResult;
                    if (sub.aborted)
                        return { lastResult, aborted: true };
                }
                this.results.push({
                    step,
                    result: { branch: taken ? 'then' : 'else' },
                });
                continue;
            }
            // --- Loop ---
            if (op === 'loop') {
                const items = resolveValue(step.over, this.variables);
                if (!Array.isArray(items)) {
                    this.results.push({ step, result: { error: 'loop "over" did not resolve to a list' } });
                    continue;
                }
                const loopVar = step.as || 'item';
                for (const item of items) {
                    this.variables[loopVar] = item;
                    const sub = await this.runSteps(step.steps || []);
                    lastResult = sub.lastResult;
                    if (sub.aborted)
                        return { lastResult, aborted: true };
                }
                continue;
            }
            // --- Set variable ---
            if (op === 'set') {
                const varName = step.var;
                this.variables[varName] = resolveValue(step.value, this.variables);
                this.results.push({ step, result: { set: varName, value: this.variables[varName] } });
                continue;
            }
            // --- Assert ---
            if (op === 'assert') {
                const condition = resolveTemplate(step.condition, this.variables);
                if (!evaluateCondition(condition, this.variables)) {
                    const msg = step.message || `Assertion failed: ${step.condition}`;
                    this.results.push({ step, result: { error: msg } });
                    return { lastResult: { error: msg }, aborted: true };
                }
                this.results.push({ step, result: { asserted: true } });
                continue;
            }
            // --- Browser operations (with error recovery) ---
            const resolved = this.resolveStep(step);
            let result;
            try {
                result = await this.executor(op, resolved);
            }
            catch (err) {
                const recovery = await this.handleErrorRecovery(step, stepIndex, err instanceof Error ? err : new Error(String(err)));
                if (!recovery.shouldContinue) {
                    this.results.push({ step, result: recovery.result });
                    return { lastResult: recovery.result, aborted: true };
                }
                result = recovery.result;
            }
            this.results.push({ step, result });
            lastResult = result;
            // If extract returned data, merge into variables
            if (op === 'extract' && result && typeof result === 'object') {
                const data = result.result ?? result;
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    Object.assign(this.variables, data);
                }
            }
        }
        return { lastResult };
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async handleErrorRecovery(step, stepIndex, error) {
        const onError = step.onError || this.defaults.onError || 'abort';
        const maxTotal = this.defaults.maxTotalRetries ?? 10;
        if (onError === 'retry') {
            const maxRetries = step.maxRetries ?? 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (this.totalRetriesUsed >= maxTotal) {
                    this.errorLog.push({
                        step_index: stepIndex,
                        error: error.message,
                        recovery_action: 'abort (max total retries exceeded)',
                        retries: attempt - 1,
                    });
                    return { result: { error: error.message }, shouldContinue: false };
                }
                this.totalRetriesUsed++;
                const delay = Math.min(2 ** (attempt - 1) * 1000, 10000);
                await this.sleep(delay);
                try {
                    const resolved = this.resolveStep(step);
                    const result = await this.executor(step.op, resolved);
                    this.errorLog.push({
                        step_index: stepIndex,
                        error: error.message,
                        recovery_action: 'retry',
                        retries: attempt,
                    });
                    return { result, shouldContinue: true };
                }
                catch (retryErr) {
                    error = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
                }
            }
            this.errorLog.push({
                step_index: stepIndex,
                error: error.message,
                recovery_action: 'abort (retries exhausted)',
                retries: maxRetries,
            });
            return { result: { error: error.message }, shouldContinue: false };
        }
        if (onError === 'skip') {
            this.errorLog.push({
                step_index: stepIndex,
                error: error.message,
                recovery_action: 'skip',
                retries: 0,
            });
            return { result: step.default ?? {}, shouldContinue: true };
        }
        if (onError === 'fallback') {
            this.errorLog.push({
                step_index: stepIndex,
                error: error.message,
                recovery_action: 'fallback',
                retries: 0,
            });
            const fallbackSteps = step.fallback || [];
            if (fallbackSteps.length > 0) {
                const sub = await this.runSteps(fallbackSteps);
                return { result: sub.lastResult ?? {}, shouldContinue: true };
            }
            return { result: { error: error.message }, shouldContinue: true };
        }
        // abort (default)
        this.errorLog.push({
            step_index: stepIndex,
            error: error.message,
            recovery_action: 'abort',
            retries: 0,
        });
        return { result: { error: error.message }, shouldContinue: false };
    }
}
//# sourceMappingURL=workflow-engine.js.map