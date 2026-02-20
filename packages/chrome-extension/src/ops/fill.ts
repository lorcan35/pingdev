// fill — Smart Form Filling
import type { BridgeResponse } from '../types';
import { findElement, isVisible, dispatchInputEvents, sleep } from './helpers';

interface FillCommand {
  fields: Record<string, string>;
}

interface FilledField {
  field: string;
  value: string;
  selector: string;
  success: boolean;
}

export async function handleFill(command: FillCommand): Promise<BridgeResponse> {
  const { fields } = command;
  if (!fields || typeof fields !== 'object') {
    return { success: false, error: 'Missing fields object' };
  }

  const filled: FilledField[] = [];
  const skipped: string[] = [];

  for (const [fieldKey, value] of Object.entries(fields)) {
    const result = await fillField(fieldKey, String(value));
    if (result) {
      filled.push(result);
    } else {
      skipped.push(fieldKey);
    }
  }

  return {
    success: true,
    data: { filled, skipped },
  };
}

async function fillField(fieldKey: string, value: string): Promise<FilledField | null> {
  // Try multiple strategies to find the field
  const el = findFieldElement(fieldKey);
  if (!el) return null;

  const selector = describeElement(el);

  if (el instanceof HTMLInputElement) {
    return await fillInput(el, fieldKey, value, selector);
  }
  if (el instanceof HTMLTextAreaElement) {
    el.focus();
    dispatchInputEvents(el, value);
    return { field: fieldKey, value, selector, success: true };
  }
  if (el instanceof HTMLSelectElement) {
    return fillNativeSelect(el, fieldKey, value, selector);
  }

  // Contenteditable
  if (el.getAttribute('contenteditable') === 'true') {
    (el as HTMLElement).focus();
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { field: fieldKey, value, selector, success: true };
  }

  // Custom dropdown (div with role=combobox, listbox trigger, etc.)
  const customResult = await fillCustomDropdown(el, value);
  if (customResult) {
    return { field: fieldKey, value, selector, success: true };
  }

  return null;
}

async function fillInput(el: HTMLInputElement, fieldKey: string, value: string, selector: string): Promise<FilledField> {
  const type = el.type.toLowerCase();

  if (type === 'checkbox') {
    const shouldCheck = value === 'true' || value === '1' || value === 'yes' || value === 'on';
    if (el.checked !== shouldCheck) {
      el.click();
    }
    return { field: fieldKey, value: String(el.checked), selector, success: true };
  }

  if (type === 'radio') {
    el.click();
    return { field: fieldKey, value: el.value, selector, success: true };
  }

  if (type === 'file') {
    // Can't set file input value directly from content script
    return { field: fieldKey, value, selector, success: false };
  }

  // text, email, password, number, tel, date, datetime-local, url, search, etc.
  el.focus();
  dispatchInputEvents(el, value);
  return { field: fieldKey, value, selector, success: true };
}

function fillNativeSelect(el: HTMLSelectElement, fieldKey: string, value: string, selector: string): FilledField {
  const lowerValue = value.toLowerCase();
  let matched = false;

  // Try by value
  for (const opt of Array.from(el.options)) {
    if (opt.value === value || opt.value.toLowerCase() === lowerValue) {
      el.value = opt.value;
      matched = true;
      break;
    }
  }

  // Try by text
  if (!matched) {
    for (const opt of Array.from(el.options)) {
      if (opt.text.toLowerCase() === lowerValue || opt.text.toLowerCase().includes(lowerValue)) {
        el.value = opt.value;
        matched = true;
        break;
      }
    }
  }

  if (matched) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return { field: fieldKey, value: el.value, selector, success: matched };
}

async function fillCustomDropdown(el: Element, value: string): Promise<boolean> {
  // Check if this element is a custom dropdown trigger (React Select, MUI, etc.)
  const role = el.getAttribute('role');
  if (role === 'combobox' || role === 'listbox' || el.classList.toString().includes('select')) {
    (el as HTMLElement).click();
    await sleep(200);

    // Find options in listbox
    const lowerValue = value.toLowerCase();
    const listbox = document.querySelector('[role="listbox"]');
    if (listbox) {
      const options = listbox.querySelectorAll('[role="option"]');
      for (const opt of Array.from(options)) {
        const text = opt.textContent?.trim() || '';
        if (text.toLowerCase() === lowerValue || text.toLowerCase().includes(lowerValue)) {
          (opt as HTMLElement).click();
          return true;
        }
      }
    }

    // Try any dropdown/menu that appeared
    const menuItems = document.querySelectorAll('[role="option"], [role="menuitem"], li[class*="option"]');
    for (const item of Array.from(menuItems)) {
      if (isVisible(item) && item.textContent?.trim().toLowerCase().includes(lowerValue)) {
        (item as HTMLElement).click();
        return true;
      }
    }
  }
  return false;
}

function findFieldElement(fieldKey: string): Element | null {
  // 1. Try as CSS selector directly
  const direct = findElement(fieldKey);
  if (direct && isFormElement(direct)) return direct;

  const lowerKey = fieldKey.toLowerCase();

  // 2. Find by label text
  const labels = document.querySelectorAll('label');
  for (const label of Array.from(labels)) {
    const text = label.textContent?.trim().toLowerCase() || '';
    if (text === lowerKey || text.includes(lowerKey)) {
      const forId = label.getAttribute('for');
      if (forId) {
        const target = document.getElementById(forId);
        if (target) return target;
      }
      // Label wrapping the input
      const input = label.querySelector('input, select, textarea');
      if (input) return input;
    }
  }

  // 3. Find by placeholder
  const inputs = document.querySelectorAll('input, textarea');
  for (const input of Array.from(inputs)) {
    const ph = input.getAttribute('placeholder')?.toLowerCase() || '';
    if (ph === lowerKey || ph.includes(lowerKey)) return input;
  }

  // 4. Find by name attribute
  const byName = document.querySelector(`[name="${fieldKey}"], [name="${fieldKey.toLowerCase()}"]`);
  if (byName) return byName;

  // 5. Find by id
  const byId = document.getElementById(fieldKey);
  if (byId) return byId;

  // 6. Find by aria-label
  const allInputs = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
  for (const input of Array.from(allInputs)) {
    const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || '';
    if (ariaLabel === lowerKey || ariaLabel.includes(lowerKey)) return input;
  }

  // 7. Find by preceding text node (common in simple forms)
  for (const input of Array.from(allInputs)) {
    const prev = input.previousElementSibling;
    if (prev && prev.textContent?.trim().toLowerCase().includes(lowerKey)) return input;
  }

  return null;
}

function isFormElement(el: Element): boolean {
  return el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.getAttribute('contenteditable') === 'true' ||
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('role') === 'listbox';
}

function describeElement(el: Element): string {
  if (el.id) return `#${el.id}`;
  const name = el.getAttribute('name');
  if (name) return `[name="${name}"]`;
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
  return el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : '');
}
