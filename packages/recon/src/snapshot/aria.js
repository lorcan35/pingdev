"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureAriaTree = captureAriaTree;
/** Capture the accessibility tree of the page via CDP. */
async function captureAriaTree(page) {
    let cdp;
    try {
        cdp = await page.context().newCDPSession(page);
    }
    catch {
        // Fallback: build a basic tree from DOM roles
        return buildTreeFromDOM(page);
    }
    try {
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        if (!nodes || nodes.length === 0)
            return [];
        return buildTreeFromCDP(nodes);
    }
    catch {
        return buildTreeFromDOM(page);
    }
    finally {
        await cdp.detach().catch(() => { });
    }
}
/** Build AriaNode tree from CDP accessibility nodes. */
function buildTreeFromCDP(nodes) {
    const nodeMap = new Map();
    for (const node of nodes) {
        nodeMap.set(node.nodeId, node);
    }
    // Find root nodes (no parent or parent is the root WebArea)
    const rootId = nodes[0]?.nodeId;
    const roots = nodes.filter(n => n.parentId === rootId && !n.ignored);
    function convert(cdpNode) {
        if (cdpNode.ignored)
            return null;
        const role = cdpNode.role?.value ?? 'none';
        if (role === 'none' || role === 'ignored')
            return null;
        const result = { role };
        if (cdpNode.name?.value)
            result.name = cdpNode.name.value;
        if (cdpNode.value?.value)
            result.value = String(cdpNode.value.value);
        if (cdpNode.description?.value)
            result.description = cdpNode.description.value;
        // Parse properties
        if (cdpNode.properties) {
            for (const prop of cdpNode.properties) {
                switch (prop.name) {
                    case 'checked':
                        result.checked = prop.value.value;
                        break;
                    case 'disabled':
                        result.disabled = prop.value.value;
                        break;
                    case 'expanded':
                        result.expanded = prop.value.value;
                        break;
                    case 'level':
                        result.level = prop.value.value;
                        break;
                    case 'pressed':
                        result.pressed = prop.value.value;
                        break;
                    case 'selected':
                        result.selected = prop.value.value;
                        break;
                }
            }
        }
        // Process children
        const childNodes = nodes.filter(n => n.parentId === cdpNode.nodeId);
        if (childNodes.length > 0) {
            const children = childNodes.map(convert).filter((c) => c !== null);
            if (children.length > 0)
                result.children = children;
        }
        return result;
    }
    return roots.map(convert).filter((n) => n !== null);
}
/** Fallback: build a basic ARIA tree from DOM role attributes. */
async function buildTreeFromDOM(page) {
    return page.evaluate(() => {
        const ROLES_TO_CAPTURE = [
            'banner', 'navigation', 'main', 'contentinfo', 'complementary',
            'form', 'search', 'dialog', 'button', 'link', 'textbox',
            'combobox', 'listbox', 'menu', 'menubar', 'tablist', 'tab',
            'tree', 'grid', 'heading', 'img', 'list', 'listitem',
            'checkbox', 'radio', 'switch', 'slider', 'progressbar',
            'status', 'alert', 'log',
        ];
        function buildNode(el) {
            const role = el.getAttribute('role') ?? implicitRole(el);
            if (!role || !ROLES_TO_CAPTURE.includes(role))
                return null;
            const node = { role };
            const label = el.getAttribute('aria-label') ?? el.innerText?.trim().slice(0, 100);
            if (label)
                node.name = label;
            const value = el.value;
            if (value)
                node.value = value;
            if (el.disabled)
                node.disabled = true;
            const checked = el.getAttribute('aria-checked');
            if (checked)
                node.checked = checked === 'mixed' ? 'mixed' : checked === 'true';
            const expanded = el.getAttribute('aria-expanded');
            if (expanded)
                node.expanded = expanded === 'true';
            return node;
        }
        function implicitRole(el) {
            const tag = el.tagName.toLowerCase();
            const map = {
                header: 'banner', nav: 'navigation', main: 'main',
                footer: 'contentinfo', aside: 'complementary', form: 'form',
                button: 'button', a: 'link', input: 'textbox',
                textarea: 'textbox', select: 'combobox', h1: 'heading',
                h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading',
                h6: 'heading', img: 'img', ul: 'list', ol: 'list', li: 'listitem',
                dialog: 'dialog',
            };
            return map[tag] ?? null;
        }
        // Collect top-level landmark nodes
        const selector = ROLES_TO_CAPTURE.map(r => `[role="${r}"]`).join(', ') +
            ', header, nav, main, footer, aside, form, dialog, button, a, input, textarea, select, h1, h2, h3, h4, h5, h6';
        const topLevelEls = document.querySelectorAll(selector);
        const nodes = [];
        for (const el of topLevelEls) {
            const node = buildNode(el);
            if (node)
                nodes.push(node);
        }
        return nodes;
    });
}
//# sourceMappingURL=aria.js.map