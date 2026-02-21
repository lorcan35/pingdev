/**
 * Google Sheets selectors — tiered fallbacks, most specific first.
 * PingOS runtime tries each tier in order and uses the first visible match.
 */
export declare const selectors: {
    /** Formula / editing bar */
    readonly formulaBar: readonly ["#t-formula-bar-input", "[aria-label=\"Formula input\"]", ".cell-input"];
    /** The main canvas grid */
    readonly cellGrid: readonly ["canvas.waffle-decorations-canvas", "canvas[role=\"presentation\"]", "canvas"];
    /** Accessibility overlay grid (over the canvas) */
    readonly accessibilityGrid: readonly ["[role=\"grid\"]", "table.waffle"];
    /** Individual cell in the accessibility overlay */
    readonly cell: (ref: string) => string;
    /** Toolbar buttons */
    readonly toolbar: {
        readonly bold: readonly ["aria=Bold", "[aria-label=\"Bold (Ctrl+B)\"]", "[data-tooltip=\"Bold\"]"];
        readonly italic: readonly ["aria=Italic", "[aria-label=\"Italic (Ctrl+I)\"]", "[data-tooltip=\"Italic\"]"];
        readonly underline: readonly ["aria=Underline", "[aria-label=\"Underline (Ctrl+U)\"]"];
        readonly strikethrough: readonly ["aria=Strikethrough"];
        readonly fontSize: readonly ["[aria-label=\"Font size\"]"];
        readonly fontFamily: readonly ["[aria-label=\"Font\"]"];
        readonly textColor: readonly ["[aria-label=\"Text color\"]"];
        readonly fillColor: readonly ["[aria-label=\"Fill color\"]"];
        readonly borders: readonly ["[aria-label=\"Borders\"]"];
        readonly mergeCell: readonly ["[aria-label=\"Merge cells\"]"];
        readonly alignLeft: readonly ["[aria-label=\"Left align\"]"];
        readonly alignCenter: readonly ["[aria-label=\"Center align\"]"];
        readonly alignRight: readonly ["[aria-label=\"Right align\"]"];
        readonly undo: readonly ["aria=Undo", "[aria-label=\"Undo (Ctrl+Z)\"]"];
        readonly redo: readonly ["aria=Redo", "[aria-label=\"Redo (Ctrl+Y)\"]"];
    };
    /** Menu bar */
    readonly menuBar: "[role=\"menubar\"]";
    readonly menus: {
        readonly file: "role=menuitem:File";
        readonly edit: "role=menuitem:Edit";
        readonly view: "role=menuitem:View";
        readonly insert: "role=menuitem:Insert";
        readonly format: "role=menuitem:Format";
        readonly data: "role=menuitem:Data";
        readonly tools: "role=menuitem:Tools";
        readonly extensions: "role=menuitem:Extensions";
        readonly help: "role=menuitem:Help";
    };
    /** Sheet tabs at the bottom */
    readonly sheetTabs: {
        readonly container: "[role=\"tablist\"]";
        readonly tab: (name: string) => string;
        readonly addSheet: "aria=Add Sheet";
    };
    /** Context menu */
    readonly contextMenu: "[role=\"menu\"]";
    readonly contextMenuItem: (label: string) => string;
    /** Name box (cell reference display) */
    readonly nameBox: readonly ["#t-name-box", "[aria-label=\"Name Box\"]"];
};
//# sourceMappingURL=selectors.d.ts.map