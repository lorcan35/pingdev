// selectOption — Handle Complex Dropdowns
import type { BridgeResponse } from '../types';
import { findElement, isVisible, sleep } from './helpers';

interface SelectOptionCommand {
  selector: string;
  value?: string;
  text?: string;
  search?: string;
  values?: string[];
}

export async function handleSelectOption(command: SelectOptionCommand): Promise<BridgeResponse> {
  const { selector, value, text, search, values } = command;
  if (!selector) return { success: false, error: 'Missing selector' };

  const el = findElement(selector);
  if (!el) return { success: false, error: `Element not found: ${selector}` };

  // Multi-select mode
  if (values && values.length > 0) {
    return handleMultiSelect(el, values);
  }

  const matchText = text || value || search || '';
  if (!matchText) return { success: false, error: 'Provide value, text, or search' };

  // Native <select>
  if (el instanceof HTMLSelectElement) {
    return selectNative(el, matchText);
  }

  // Custom dropdown
  return selectCustom(el, matchText, !!search);
}

function selectNative(el: HTMLSelectElement, matchText: string): BridgeResponse {
  const lowerMatch = matchText.toLowerCase();

  // Try by value first
  for (const opt of Array.from(el.options)) {
    if (opt.value === matchText || opt.value.toLowerCase() === lowerMatch) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        data: { selected: opt.value, display: opt.text, success: true },
      };
    }
  }

  // Try by text
  for (const opt of Array.from(el.options)) {
    if (opt.text.toLowerCase() === lowerMatch || opt.text.toLowerCase().includes(lowerMatch)) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        data: { selected: opt.value, display: opt.text, success: true },
      };
    }
  }

  return { success: true, data: { selected: null, success: false, error: 'Option not found' } };
}

async function selectCustom(el: Element, matchText: string, useSearch: boolean): Promise<BridgeResponse> {
  // Click to open the dropdown
  (el as HTMLElement).click();
  await sleep(300);

  // If search mode, try typing into the dropdown's search input
  if (useSearch) {
    const searchInput = findDropdownSearchInput(el);
    if (searchInput) {
      (searchInput as HTMLInputElement).focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(searchInput, matchText);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(400);
    }
  }

  // Find and click the matching option
  const option = findOption(matchText);
  if (option) {
    const display = option.textContent?.trim() || '';
    (option as HTMLElement).click();
    await sleep(200);

    // Verify
    const selectedText = getSelectedDisplay(el);
    return {
      success: true,
      data: { selected: matchText, display: selectedText || display, success: true },
    };
  }

  // Close dropdown if no match found
  document.body.click();
  await sleep(100);
  return { success: true, data: { selected: null, success: false, error: 'Option not found' } };
}

async function handleMultiSelect(el: Element, values: string[]): Promise<BridgeResponse> {
  if (el instanceof HTMLSelectElement && el.multiple) {
    // Native multi-select
    const selected: string[] = [];
    for (const opt of Array.from(el.options)) {
      const lowerVal = opt.value.toLowerCase();
      const lowerText = opt.text.toLowerCase();
      const shouldSelect = values.some(v => {
        const lv = v.toLowerCase();
        return lowerVal === lv || lowerText === lv || lowerText.includes(lv);
      });
      opt.selected = shouldSelect;
      if (shouldSelect) selected.push(opt.value);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, data: { selected, success: true } };
  }

  // Custom multi-select: click each option
  const selected: string[] = [];
  (el as HTMLElement).click();
  await sleep(300);

  for (const val of values) {
    const option = findOption(val);
    if (option) {
      (option as HTMLElement).click();
      selected.push(option.textContent?.trim() || val);
      await sleep(150);
    }
  }

  // Close dropdown
  document.body.click();
  await sleep(100);

  return { success: true, data: { selected, success: selected.length > 0 } };
}

function findDropdownSearchInput(trigger: Element): Element | null {
  // Check if the trigger itself is an input
  if (trigger instanceof HTMLInputElement) return trigger;

  // Look for a search input in the dropdown area
  const selectors = [
    '[role="combobox"] input',
    '[class*="search"] input',
    '[class*="select"] input[type="text"]',
    'input[class*="search"]',
    'input[type="search"]',
  ];

  for (const sel of selectors) {
    const input = document.querySelector(sel);
    if (input && isVisible(input)) return input;
  }

  // Check inside the trigger's parent
  const parent = trigger.parentElement;
  if (parent) {
    const input = parent.querySelector('input');
    if (input && isVisible(input)) return input;
  }

  return null;
}

function findOption(text: string): Element | null {
  const lowerText = text.toLowerCase();

  // Search in common option containers
  const optionSelectors = [
    '[role="option"]',
    '[role="listbox"] > *',
    '[class*="option"]',
    '[class*="menu"] li',
    '[class*="dropdown"] li',
    '[class*="select"] li',
    'li[data-value]',
  ];

  for (const sel of optionSelectors) {
    const options = document.querySelectorAll(sel);
    for (const opt of Array.from(options)) {
      if (!isVisible(opt)) continue;
      const optText = opt.textContent?.trim().toLowerCase() || '';
      const optValue = opt.getAttribute('data-value')?.toLowerCase() || '';
      if (optText === lowerText || optText.includes(lowerText) || optValue === lowerText) {
        return opt;
      }
    }
  }

  return null;
}

function getSelectedDisplay(trigger: Element): string {
  // For React Select / MUI, the displayed value is usually in a child span/div
  const valueContainer = trigger.querySelector(
    '[class*="singleValue"], [class*="value"], [class*="selected"], span, .MuiSelect-select'
  );
  return valueContainer?.textContent?.trim() || trigger.textContent?.trim() || '';
}
