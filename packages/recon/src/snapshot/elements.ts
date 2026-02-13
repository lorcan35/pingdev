/**
 * Element discovery — finds all interactive elements on a page.
 */
import type { Page } from 'playwright';
import type { SnapshotElement } from '../types.js';

/** Selectors for interactive elements. */
const INTERACTIVE_SELECTORS = [
  'input', 'button', 'a', 'textarea', 'select', 'option',
  '[role="button"]', '[role="link"]', '[role="textbox"]',
  '[role="combobox"]', '[role="menuitem"]', '[role="tab"]',
  '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
  '[role="slider"]', '[role="spinbutton"]', '[role="searchbox"]',
  '[contenteditable]', '[onclick]', '[tabindex]',
].join(', ');

/** Confidence scores by element type / role. */
const CONFIDENCE: Record<string, number> = {
  button: 1.0,
  input: 1.0,
  textarea: 1.0,
  select: 1.0,
  'role-button': 1.0,
  'role-textbox': 1.0,
  'role-combobox': 1.0,
  'role-checkbox': 1.0,
  'role-radio': 1.0,
  'role-switch': 1.0,
  'role-slider': 0.9,
  'role-spinbutton': 0.9,
  'role-searchbox': 1.0,
  'role-menuitem': 0.8,
  'role-tab': 0.8,
  'role-link': 0.7,
  a: 0.7,
  contenteditable: 0.8,
  onclick: 0.6,
  tabindex: 0.4,
};

interface RawElementData {
  tagName: string;
  type: string;
  role: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  title: string | null;
  value: string | null;
  textContent: string;
  id: string | null;
  testId: string | null;
  classList: string[];
  isVisible: boolean;
  isDisabled: boolean;
  isChecked: boolean;
  isContentEditable: boolean;
  hasOnclick: boolean;
  tabIndex: number | null;
  inputType: string | null;
  bounds: { x: number; y: number; width: number; height: number } | null;
  /** Index in the query result set, for nth-of-type fallback. */
  index: number;
}

/** Discover all interactive elements on the page. */
export async function discoverElements(page: Page): Promise<SnapshotElement[]> {
  const rawElements: RawElementData[] = await page.evaluate((selector: string) => {
    const els = Array.from(document.querySelectorAll(selector));
    return els.map((el, index) => {
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      const inputEl = el as HTMLInputElement;
      return {
        tagName: el.tagName.toLowerCase(),
        type: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        title: el.getAttribute('title'),
        value: ('value' in el) ? (el as HTMLInputElement).value : null,
        textContent: (htmlEl.textContent ?? '').trim().slice(0, 200),
        id: el.id || null,
        testId: el.getAttribute('data-testid'),
        classList: Array.from(el.classList),
        isVisible: htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0,
        isDisabled: (el as HTMLButtonElement).disabled ?? false,
        isChecked: inputEl.checked ?? false,
        isContentEditable: htmlEl.isContentEditable,
        hasOnclick: el.hasAttribute('onclick'),
        tabIndex: htmlEl.tabIndex,
        inputType: inputEl.type || null,
        bounds: rect.width > 0 ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        } : null,
        index,
      };
    });
  }, INTERACTIVE_SELECTORS);

  return rawElements.map((raw, i) => toSnapshotElement(raw, i));
}

function toSnapshotElement(raw: RawElementData, index: number): SnapshotElement {
  const elementType = resolveType(raw);
  const name = resolveName(raw, elementType, index);
  const id = `el-${index}`;

  return {
    id,
    name,
    type: elementType,
    role: raw.role ?? undefined,
    label: raw.ariaLabel ?? undefined,
    placeholder: raw.placeholder ?? undefined,
    tooltip: raw.title ?? undefined,
    value: raw.value ?? undefined,
    states: resolveStates(raw),
    cssSelectors: buildCssSelectors(raw),
    xpathSelectors: buildXPathSelectors(raw),
    ariaSelectors: buildAriaSelectors(raw),
    textContent: raw.textContent || undefined,
    bounds: raw.bounds ?? undefined,
    interactiveConfidence: resolveConfidence(raw),
  };
}

function resolveType(raw: RawElementData): string {
  if (raw.tagName === 'input') {
    return raw.inputType ?? 'text';
  }
  if (raw.tagName === 'a') return 'link';
  if (raw.role) {
    const roleMap: Record<string, string> = {
      button: 'button', link: 'link', textbox: 'textbox',
      combobox: 'combobox', menuitem: 'menuitem', tab: 'tab',
      checkbox: 'checkbox', radio: 'radio', switch: 'switch',
      slider: 'slider', spinbutton: 'spinbutton', searchbox: 'searchbox',
    };
    return roleMap[raw.role] ?? raw.role;
  }
  if (raw.isContentEditable) return 'contenteditable';
  return raw.tagName;
}

function resolveName(raw: RawElementData, type: string, index: number): string {
  if (raw.ariaLabel) return slugify(raw.ariaLabel);
  if (raw.placeholder) return slugify(raw.placeholder);
  if (raw.title) return slugify(raw.title);
  if (raw.id) return raw.id;
  if (raw.testId) return raw.testId;
  if (raw.textContent && raw.textContent.length <= 40) return slugify(raw.textContent);
  return `${type}-${index}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function resolveStates(raw: RawElementData): string[] {
  const states: string[] = [];
  states.push(raw.isVisible ? 'visible' : 'hidden');
  if (raw.isDisabled) states.push('disabled');
  if (raw.isChecked) states.push('checked');
  if (raw.isContentEditable) states.push('editable');
  return states;
}

function resolveConfidence(raw: RawElementData): number {
  if (raw.role) {
    const key = `role-${raw.role}`;
    if (key in CONFIDENCE) return CONFIDENCE[key]!;
  }
  if (raw.tagName in CONFIDENCE) return CONFIDENCE[raw.tagName]!;
  if (raw.hasOnclick) return CONFIDENCE['onclick']!;
  if (raw.isContentEditable) return CONFIDENCE['contenteditable']!;
  if (raw.tabIndex !== null && raw.tabIndex >= 0) return CONFIDENCE['tabindex']!;
  return 0.3;
}

function buildCssSelectors(raw: RawElementData): string[] {
  const selectors: string[] = [];

  // ID-based (most specific)
  if (raw.id) {
    selectors.push(`#${cssEscape(raw.id)}`);
  }

  // data-testid
  if (raw.testId) {
    selectors.push(`[data-testid="${raw.testId}"]`);
  }

  // aria-label
  if (raw.ariaLabel) {
    selectors.push(`${raw.tagName}[aria-label="${raw.ariaLabel}"]`);
  }

  // Class-based
  if (raw.classList.length > 0) {
    const classSelector = raw.tagName + raw.classList.map(c => `.${cssEscape(c)}`).join('');
    selectors.push(classSelector);
  }

  // Tag + type fallback
  if (raw.tagName === 'input' && raw.inputType) {
    selectors.push(`input[type="${raw.inputType}"]`);
  }

  return selectors;
}

/** Escape a string for use in CSS selectors (Node-safe, no CSS.escape dependency). */
function cssEscape(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}

function buildXPathSelectors(raw: RawElementData): string[] {
  const selectors: string[] = [];

  if (raw.id) {
    selectors.push(`//*[@id="${raw.id}"]`);
  }

  if (raw.ariaLabel) {
    selectors.push(`//${raw.tagName}[@aria-label="${raw.ariaLabel}"]`);
  }

  if (raw.textContent && raw.textContent.length <= 40) {
    selectors.push(`//${raw.tagName}[contains(text(),"${raw.textContent}")]`);
  }

  return selectors;
}

function buildAriaSelectors(raw: RawElementData): string[] {
  const selectors: string[] = [];

  if (raw.role && raw.ariaLabel) {
    selectors.push(`${raw.role}[name="${raw.ariaLabel}"]`);
  } else if (raw.role) {
    selectors.push(raw.role);
  }

  return selectors;
}
