/**
 * Google Sheets PingApp — Gold standard automation layer.
 *
 * Each action documents the PingOS ops it uses.
 * Stubs marked with TODO are filled in when connected to a live PingOS instance.
 */
import { selectors } from './selectors';
export { selectors };
/** Represents a PingOS device connection */
interface PingDevice {
    op(name: string, payload: Record<string, unknown>): Promise<{
        ok: boolean;
        data?: any;
        error?: string;
    }>;
}
/**
 * Select (click) a cell by its A1 reference.
 * Ops: click
 */
export declare function selectCell(dev: PingDevice, ref: string): Promise<void>;
/**
 * Type a value into a cell. Double-clicks to enter edit mode, types, then confirms with Enter.
 * Ops: dblclick → type → press
 */
export declare function typeInCell(dev: PingDevice, ref: string, value: string): Promise<void>;
/**
 * Read the content of a cell by clicking it and reading the formula bar.
 * Ops: click → read
 */
export declare function readCell(dev: PingDevice, ref: string): Promise<string>;
/**
 * Toggle bold formatting on the current selection.
 * Ops: press (Ctrl+B)
 */
export declare function formatBold(dev: PingDevice): Promise<void>;
/**
 * Insert a row below the current selection via context menu.
 * Ops: press (Ctrl+Shift+=)
 */
export declare function insertRow(dev: PingDevice): Promise<void>;
/**
 * Navigate to a specific sheet tab by name.
 * Ops: click
 */
export declare function navigate(dev: PingDevice, sheetName: string): Promise<void>;
/**
 * Open a top-level menu by name.
 * Ops: click
 */
export declare function openMenu(dev: PingDevice, menuName: keyof typeof selectors.menus): Promise<void>;
/**
 * Close any open menu/dialog by pressing Escape.
 * Ops: press
 */
export declare function closeMenu(dev: PingDevice): Promise<void>;
/**
 * Copy the current selection.
 * Ops: press (Ctrl+C)
 */
export declare function copy(dev: PingDevice): Promise<void>;
/**
 * Paste clipboard content.
 * Ops: press (Ctrl+V)
 */
export declare function paste(dev: PingDevice): Promise<void>;
/**
 * Undo the last action.
 * Ops: press (Ctrl+Z)
 */
export declare function undo(dev: PingDevice): Promise<void>;
/**
 * Read a range of cell values from the ARIA accessibility overlay.
 * Ops: read (with cell range syntax)
 *
 * Example: readRange(dev, 'A1', 'C5') → { cells: { A1: '...', A2: '...', B1: '...', ... }, count: 15 }
 */
export declare function readRange(dev: PingDevice, startRef: string, endRef: string): Promise<Record<string, string>>;
/**
 * Click at specific pixel coordinates on the canvas grid.
 * Use when ARIA overlay is unavailable or for precise positioning.
 * Ops: click (with x,y coordinates)
 *
 * Example: clickCanvasAt(dev, 150, 200) → clicks at pixel (150, 200) within the canvas
 */
export declare function clickCanvasAt(dev: PingDevice, x: number, y: number): Promise<void>;
/**
 * Run a recon scan to detect Sheets structure.
 * Returns canvas info, ARIA overlay status, grid dimensions, cell samples,
 * selection state, toolbar state, and automation strategy recommendation.
 * Ops: recon
 */
export declare function reconSheets(dev: PingDevice): Promise<any>;
//# sourceMappingURL=index.d.ts.map