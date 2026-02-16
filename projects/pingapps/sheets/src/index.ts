/**
 * Google Sheets PingApp — Gold standard automation layer.
 *
 * Each action documents the PingOS ops it uses.
 * Stubs marked with TODO are filled in when connected to a live PingOS instance.
 */

import { selectors } from './selectors';

// Re-export selectors for convenience
export { selectors };

/** Represents a PingOS device connection */
interface PingDevice {
  op(name: string, payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }>;
}

/**
 * Select (click) a cell by its A1 reference.
 * Ops: click
 */
export async function selectCell(dev: PingDevice, ref: string): Promise<void> {
  const result = await dev.op('click', { selector: selectors.cell(ref) });
  if (!result.ok) throw new Error(`selectCell(${ref}) failed: ${result.error}`);
}

/**
 * Type a value into a cell. Double-clicks to enter edit mode, types, then confirms with Enter.
 * Ops: dblclick → type → press
 */
export async function typeInCell(dev: PingDevice, ref: string, value: string): Promise<void> {
  await dev.op('dblclick', { selector: selectors.cell(ref) });
  await dev.op('type', { selector: selectors.formulaBar[0], text: value });
  await dev.op('press', { key: 'Enter' });
}

/**
 * Read the content of a cell by clicking it and reading the formula bar.
 * Ops: click → read
 */
export async function readCell(dev: PingDevice, ref: string): Promise<string> {
  await dev.op('click', { selector: selectors.cell(ref) });
  const result = await dev.op('read', { selector: selectors.formulaBar[0] });
  if (!result.ok) throw new Error(`readCell(${ref}) failed: ${result.error}`);
  return result.data ?? '';
}

/**
 * Toggle bold formatting on the current selection.
 * Ops: press (Ctrl+B)
 */
export async function formatBold(dev: PingDevice): Promise<void> {
  await dev.op('press', { key: 'b', modifiers: ['Control'] });
}

/**
 * Insert a row below the current selection via context menu.
 * Ops: press (Ctrl+Shift+=)
 */
export async function insertRow(dev: PingDevice): Promise<void> {
  // Use Sheets keyboard shortcut: Ctrl+Shift+= opens insert dialog
  // Then select "Row below" option
  await dev.op('press', { key: '+', modifiers: ['Control', 'Shift'] });
  // TODO: handle the insert dialog that appears — select "Entire row" and confirm
}

/**
 * Navigate to a specific sheet tab by name.
 * Ops: click
 */
export async function navigate(dev: PingDevice, sheetName: string): Promise<void> {
  const result = await dev.op('click', { selector: selectors.sheetTabs.tab(sheetName) });
  if (!result.ok) throw new Error(`navigate(${sheetName}) failed: ${result.error}`);
}

/**
 * Open a top-level menu by name.
 * Ops: click
 */
export async function openMenu(dev: PingDevice, menuName: keyof typeof selectors.menus): Promise<void> {
  const sel = selectors.menus[menuName];
  const result = await dev.op('click', { selector: sel });
  if (!result.ok) throw new Error(`openMenu(${menuName}) failed: ${result.error}`);
}

/**
 * Close any open menu/dialog by pressing Escape.
 * Ops: press
 */
export async function closeMenu(dev: PingDevice): Promise<void> {
  await dev.op('press', { key: 'Escape' });
}

/**
 * Copy the current selection.
 * Ops: press (Ctrl+C)
 */
export async function copy(dev: PingDevice): Promise<void> {
  await dev.op('press', { key: 'c', modifiers: ['Control'] });
}

/**
 * Paste clipboard content.
 * Ops: press (Ctrl+V)
 */
export async function paste(dev: PingDevice): Promise<void> {
  await dev.op('press', { key: 'v', modifiers: ['Control'] });
}

/**
 * Undo the last action.
 * Ops: press (Ctrl+Z)
 */
export async function undo(dev: PingDevice): Promise<void> {
  await dev.op('press', { key: 'z', modifiers: ['Control'] });
}

/**
 * Run a recon scan to detect Sheets structure.
 * Ops: recon
 */
export async function reconSheets(dev: PingDevice): Promise<any> {
  const result = await dev.op('recon', {});
  if (!result.ok) throw new Error(`recon failed: ${result.error}`);
  return result.data;
}
