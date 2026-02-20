// table — Smart Table Extraction
import type { BridgeResponse } from '../types';
import { findElement, isVisible } from './helpers';

interface TableCommand {
  selector?: string;
  index?: number;
}

interface ExtractedTable {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  pagination?: { hasNext: boolean; indicator?: string };
}

export async function handleTable(command: TableCommand): Promise<BridgeResponse> {
  const tables: ExtractedTable[] = [];

  if (command.selector) {
    const el = findElement(command.selector);
    if (!el) return { success: false, error: `Element not found: ${command.selector}` };
    const extracted = extractFromElement(el);
    if (extracted) tables.push(extracted);
  } else {
    // Auto-detect tables
    const detected = detectTables();
    const startIdx = command.index != null ? command.index : 0;
    const endIdx = command.index != null ? command.index + 1 : detected.length;
    for (let i = startIdx; i < endIdx && i < detected.length; i++) {
      const extracted = extractFromElement(detected[i]);
      if (extracted) tables.push(extracted);
    }
  }

  if (tables.length === 0) {
    return { success: true, data: { tables: [], message: 'No tables found' } };
  }

  return { success: true, data: { tables } };
}

function detectTables(): Element[] {
  const found: Element[] = [];

  // 1. HTML tables
  const htmlTables = document.querySelectorAll('table');
  for (const t of Array.from(htmlTables)) {
    if (isVisible(t)) found.push(t);
  }

  // 2. ARIA grid/table roles
  const ariaTables = document.querySelectorAll('[role="grid"], [role="table"]');
  for (const t of Array.from(ariaTables)) {
    if (isVisible(t) && !found.includes(t)) found.push(t);
  }

  // 3. Div-based grids: detect repeated row patterns
  if (found.length === 0) {
    const divGrids = detectDivGrids();
    found.push(...divGrids);
  }

  return found;
}

function extractFromElement(el: Element): ExtractedTable | null {
  if (el.tagName === 'TABLE') {
    return extractHtmlTable(el as HTMLTableElement);
  }

  const role = el.getAttribute('role');
  if (role === 'grid' || role === 'table') {
    return extractAriaTable(el);
  }

  // Try as div grid
  return extractDivGrid(el);
}

function extractHtmlTable(table: HTMLTableElement): ExtractedTable {
  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  // Extract headers from thead > th, or first row th elements
  const thead = table.querySelector('thead');
  const headerCells = thead
    ? thead.querySelectorAll('th, td')
    : table.querySelectorAll('tr:first-child th');

  for (const th of Array.from(headerCells)) {
    headers.push(th.textContent?.trim() || '');
  }

  // If no headers found from th, use first row as headers
  if (headers.length === 0) {
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      for (const cell of Array.from(firstRow.querySelectorAll('td, th'))) {
        headers.push(cell.textContent?.trim() || '');
      }
    }
  }

  // Extract data rows
  const tbody = table.querySelector('tbody') || table;
  const trs = tbody.querySelectorAll('tr');
  const startRow = (thead || headers.length > 0) ? 0 : 1;

  for (let i = 0; i < trs.length; i++) {
    const tr = trs[i];
    // Skip header row if it's in tbody
    if (i === 0 && !thead && headers.length > 0) continue;
    // Skip rows inside thead
    if (tr.closest('thead')) continue;

    const cells = tr.querySelectorAll('td, th');
    const rowData: Record<string, string> = {};
    for (let j = 0; j < cells.length; j++) {
      const key = headers[j] || `col_${j}`;
      rowData[key] = cells[j].textContent?.trim() || '';
    }
    if (Object.keys(rowData).length > 0) rows.push(rowData);
  }

  const pagination = detectPagination(table);

  return { headers, rows, rowCount: rows.length, pagination };
}

function extractAriaTable(el: Element): ExtractedTable {
  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  // Find header row
  const headerRow = el.querySelector('[role="row"]:first-child, [role="columnheader"]')?.closest('[role="row"]');
  if (headerRow) {
    const headerCells = headerRow.querySelectorAll('[role="columnheader"], [role="gridcell"]');
    for (const cell of Array.from(headerCells)) {
      headers.push(cell.textContent?.trim() || '');
    }
  }

  // Find data rows
  const allRows = el.querySelectorAll('[role="row"]');
  for (const row of Array.from(allRows)) {
    if (row === headerRow) continue;
    const cells = row.querySelectorAll('[role="gridcell"], [role="cell"]');
    if (cells.length === 0) continue;
    const rowData: Record<string, string> = {};
    for (let j = 0; j < cells.length; j++) {
      const key = headers[j] || `col_${j}`;
      rowData[key] = cells[j].textContent?.trim() || '';
    }
    rows.push(rowData);
  }

  const pagination = detectPagination(el);

  return { headers, rows, rowCount: rows.length, pagination };
}

function extractDivGrid(container: Element): ExtractedTable | null {
  // Find repeated child elements with same tag/class structure
  const children = Array.from(container.children).filter(c => isVisible(c));
  if (children.length < 2) return null;

  // Check if children have similar structure
  const firstClass = children[0].className;
  const sameClass = children.filter(c => c.className === firstClass);
  if (sameClass.length < children.length * 0.7) return null;

  // Use first row as template for headers
  const firstChildren = Array.from(children[0].children);
  const headers = firstChildren.map((c, i) => {
    const text = c.textContent?.trim() || '';
    return text.length < 50 ? text : `col_${i}`;
  });

  // Use first row as header, rest as data
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < children.length; i++) {
    const cells = Array.from(children[i].children);
    const rowData: Record<string, string> = {};
    for (let j = 0; j < cells.length; j++) {
      const key = headers[j] || `col_${j}`;
      rowData[key] = cells[j].textContent?.trim() || '';
    }
    rows.push(rowData);
  }

  return { headers, rows, rowCount: rows.length };
}

function detectDivGrids(): Element[] {
  const found: Element[] = [];
  // Look for containers with many similar children
  const containers = document.querySelectorAll('div, section, main, ul, ol');
  for (const container of Array.from(containers)) {
    const children = Array.from(container.children).filter(c => isVisible(c));
    if (children.length < 3) continue;

    // Check class similarity
    const classCounts: Record<string, number> = {};
    for (const c of children) {
      const cls = c.className || c.tagName;
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }
    const maxCount = Math.max(...Object.values(classCounts));
    if (maxCount >= children.length * 0.7 && maxCount >= 3) {
      found.push(container);
      if (found.length >= 5) break;
    }
  }
  return found;
}

function detectPagination(tableEl: Element): { hasNext: boolean; indicator?: string } | undefined {
  // Look near the table for pagination controls
  const parent = tableEl.parentElement;
  if (!parent) return undefined;

  // Search siblings and parent for pagination
  const searchArea = parent;
  const paginationSelectors = [
    '[class*="pagination"]', '[class*="pager"]',
    '[rel="next"]', 'nav[aria-label*="page"]',
    '[aria-label*="next"]', '[aria-label*="Next"]',
  ];

  for (const sel of paginationSelectors) {
    const el = searchArea.querySelector(sel);
    if (el && isVisible(el)) {
      const nextBtn = el.querySelector('[rel="next"], [aria-label*="next"], [aria-label*="Next"]') ||
        Array.from(el.querySelectorAll('a, button')).find(a =>
          /next|›|»|>/i.test(a.textContent?.trim() || '')
        );

      const pageText = el.textContent?.trim() || '';
      const pageMatch = pageText.match(/page\s+(\d+)\s+of\s+(\d+)/i);

      return {
        hasNext: nextBtn != null && !nextBtn.hasAttribute('disabled'),
        indicator: pageMatch ? `Page ${pageMatch[1]} of ${pageMatch[2]}` : undefined,
      };
    }
  }

  return undefined;
}
