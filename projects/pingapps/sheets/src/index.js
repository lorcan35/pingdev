"use strict";
/**
 * Google Sheets PingApp — Gold standard automation layer.
 *
 * Each action documents the PingOS ops it uses.
 * Stubs marked with TODO are filled in when connected to a live PingOS instance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectors = void 0;
exports.selectCell = selectCell;
exports.typeInCell = typeInCell;
exports.readCell = readCell;
exports.formatBold = formatBold;
exports.insertRow = insertRow;
exports.navigate = navigate;
exports.openMenu = openMenu;
exports.closeMenu = closeMenu;
exports.copy = copy;
exports.paste = paste;
exports.undo = undo;
exports.readRange = readRange;
exports.clickCanvasAt = clickCanvasAt;
exports.reconSheets = reconSheets;
const selectors_1 = require("./selectors");
Object.defineProperty(exports, "selectors", { enumerable: true, get: function () { return selectors_1.selectors; } });
/**
 * Select (click) a cell by its A1 reference.
 * Ops: click
 */
async function selectCell(dev, ref) {
    const result = await dev.op('click', { selector: selectors_1.selectors.cell(ref) });
    if (!result.ok)
        throw new Error(`selectCell(${ref}) failed: ${result.error}`);
}
/**
 * Type a value into a cell. Double-clicks to enter edit mode, types, then confirms with Enter.
 * Ops: dblclick → type → press
 */
async function typeInCell(dev, ref, value) {
    await dev.op('dblclick', { selector: selectors_1.selectors.cell(ref) });
    await dev.op('type', { selector: selectors_1.selectors.formulaBar[0], text: value });
    await dev.op('press', { key: 'Enter' });
}
/**
 * Read the content of a cell by clicking it and reading the formula bar.
 * Ops: click → read
 */
async function readCell(dev, ref) {
    await dev.op('click', { selector: selectors_1.selectors.cell(ref) });
    const result = await dev.op('read', { selector: selectors_1.selectors.formulaBar[0] });
    if (!result.ok)
        throw new Error(`readCell(${ref}) failed: ${result.error}`);
    return result.data ?? '';
}
/**
 * Toggle bold formatting on the current selection.
 * Ops: press (Ctrl+B)
 */
async function formatBold(dev) {
    await dev.op('press', { key: 'b', modifiers: ['Control'] });
}
/**
 * Insert a row below the current selection via context menu.
 * Ops: press (Ctrl+Shift+=)
 */
async function insertRow(dev) {
    // Use Sheets keyboard shortcut: Ctrl+Shift+= opens insert dialog
    // Then select "Row below" option
    await dev.op('press', { key: '+', modifiers: ['Control', 'Shift'] });
    // TODO: handle the insert dialog that appears — select "Entire row" and confirm
}
/**
 * Navigate to a specific sheet tab by name.
 * Ops: click
 */
async function navigate(dev, sheetName) {
    const result = await dev.op('click', { selector: selectors_1.selectors.sheetTabs.tab(sheetName) });
    if (!result.ok)
        throw new Error(`navigate(${sheetName}) failed: ${result.error}`);
}
/**
 * Open a top-level menu by name.
 * Ops: click
 */
async function openMenu(dev, menuName) {
    const sel = selectors_1.selectors.menus[menuName];
    const result = await dev.op('click', { selector: sel });
    if (!result.ok)
        throw new Error(`openMenu(${menuName}) failed: ${result.error}`);
}
/**
 * Close any open menu/dialog by pressing Escape.
 * Ops: press
 */
async function closeMenu(dev) {
    await dev.op('press', { key: 'Escape' });
}
/**
 * Copy the current selection.
 * Ops: press (Ctrl+C)
 */
async function copy(dev) {
    await dev.op('press', { key: 'c', modifiers: ['Control'] });
}
/**
 * Paste clipboard content.
 * Ops: press (Ctrl+V)
 */
async function paste(dev) {
    await dev.op('press', { key: 'v', modifiers: ['Control'] });
}
/**
 * Undo the last action.
 * Ops: press (Ctrl+Z)
 */
async function undo(dev) {
    await dev.op('press', { key: 'z', modifiers: ['Control'] });
}
/**
 * Read a range of cell values from the ARIA accessibility overlay.
 * Ops: read (with cell range syntax)
 *
 * Example: readRange(dev, 'A1', 'C5') → { cells: { A1: '...', A2: '...', B1: '...', ... }, count: 15 }
 */
async function readRange(dev, startRef, endRef) {
    const result = await dev.op('read', { selector: `cell=${startRef}:${endRef}` });
    if (!result.ok)
        throw new Error(`readRange(${startRef}:${endRef}) failed: ${result.error}`);
    return result.data?.cells ?? {};
}
/**
 * Click at specific pixel coordinates on the canvas grid.
 * Use when ARIA overlay is unavailable or for precise positioning.
 * Ops: click (with x,y coordinates)
 *
 * Example: clickCanvasAt(dev, 150, 200) → clicks at pixel (150, 200) within the canvas
 */
async function clickCanvasAt(dev, x, y) {
    const result = await dev.op('click', { selector: selectors_1.selectors.cellGrid[0], x, y });
    if (!result.ok)
        throw new Error(`clickCanvasAt(${x}, ${y}) failed: ${result.error}`);
}
/**
 * Run a recon scan to detect Sheets structure.
 * Returns canvas info, ARIA overlay status, grid dimensions, cell samples,
 * selection state, toolbar state, and automation strategy recommendation.
 * Ops: recon
 */
async function reconSheets(dev) {
    const result = await dev.op('recon', {});
    if (!result.ok)
        throw new Error(`recon failed: ${result.error}`);
    return result.data;
}
//# sourceMappingURL=index.js.map