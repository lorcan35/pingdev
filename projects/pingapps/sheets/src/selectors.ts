/**
 * Google Sheets selectors — tiered fallbacks, most specific first.
 * PingOS runtime tries each tier in order and uses the first visible match.
 */

export const selectors = {
  /** Formula / editing bar */
  formulaBar: [
    '#t-formula-bar-input',
    '[aria-label="Formula input"]',
    '.cell-input',
  ],

  /** The main canvas grid */
  cellGrid: [
    'canvas.waffle-decorations-canvas',
    'canvas[role="presentation"]',
    'canvas',
  ],

  /** Accessibility overlay grid (over the canvas) */
  accessibilityGrid: [
    '[role="grid"]',
    'table.waffle',
  ],

  /** Individual cell in the accessibility overlay */
  cell: (ref: string) => `cell=${ref}`,

  /** Toolbar buttons */
  toolbar: {
    bold: ['aria=Bold', '[aria-label="Bold (Ctrl+B)"]', '[data-tooltip="Bold"]'],
    italic: ['aria=Italic', '[aria-label="Italic (Ctrl+I)"]', '[data-tooltip="Italic"]'],
    underline: ['aria=Underline', '[aria-label="Underline (Ctrl+U)"]'],
    strikethrough: ['aria=Strikethrough'],
    fontSize: ['[aria-label="Font size"]'],
    fontFamily: ['[aria-label="Font"]'],
    textColor: ['[aria-label="Text color"]'],
    fillColor: ['[aria-label="Fill color"]'],
    borders: ['[aria-label="Borders"]'],
    mergeCell: ['[aria-label="Merge cells"]'],
    alignLeft: ['[aria-label="Left align"]'],
    alignCenter: ['[aria-label="Center align"]'],
    alignRight: ['[aria-label="Right align"]'],
    undo: ['aria=Undo', '[aria-label="Undo (Ctrl+Z)"]'],
    redo: ['aria=Redo', '[aria-label="Redo (Ctrl+Y)"]'],
  },

  /** Menu bar */
  menuBar: '[role="menubar"]',
  menus: {
    file: 'role=menuitem:File',
    edit: 'role=menuitem:Edit',
    view: 'role=menuitem:View',
    insert: 'role=menuitem:Insert',
    format: 'role=menuitem:Format',
    data: 'role=menuitem:Data',
    tools: 'role=menuitem:Tools',
    extensions: 'role=menuitem:Extensions',
    help: 'role=menuitem:Help',
  },

  /** Sheet tabs at the bottom */
  sheetTabs: {
    container: '[role="tablist"]',
    tab: (name: string) => `role=tab:${name}`,
    addSheet: 'aria=Add Sheet',
  },

  /** Context menu */
  contextMenu: '[role="menu"]',
  contextMenuItem: (label: string) => `role=menuitem:${label}`,

  /** Name box (cell reference display) */
  nameBox: ['#t-name-box', '[aria-label="Name Box"]'],
} as const;
