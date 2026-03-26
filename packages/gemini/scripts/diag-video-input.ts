/**
 * Diagnostic: Understand how the Create Videos input works.
 * Takes screenshot + inspects contenteditable state through multiple interactions.
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:18800';
const GEMINI_URL = 'https://gemini.google.com/u/1/app';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
  const ctx = browser.contexts()[0]!;
  const page = ctx.pages().find(p => p.url().includes('gemini.google.com')) ?? ctx.pages()[0]!;

  // Fresh chat
  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await sleep(3000);
  await page.keyboard.press('Escape');
  await sleep(500);

  // Activate Create Videos
  console.log('--- Activating Create Videos ---');
  await page.locator('role=button[name="Tools"]').first().click();
  await sleep(500);
  await page.locator('role=menuitemcheckbox[name=/Create videos/i]').first().click();
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(1000);

  // Check state
  const state1 = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    return {
      contenteditable: ed?.getAttribute('contenteditable'),
      placeholder: ed?.getAttribute('data-placeholder'),
      className: ed?.className,
      text: ed?.textContent?.trim(),
    };
  });
  console.log('State 1 (after tool activation):', JSON.stringify(state1));

  // Screenshot
  await page.screenshot({ path: 'docs/diag-1-after-tool.png' });

  // Try clicking the input
  console.log('--- Clicking input ---');
  await page.locator('.ql-editor').first().click({ force: true });
  await sleep(1000);

  const state2 = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    return {
      contenteditable: ed?.getAttribute('contenteditable'),
      focused: document.activeElement === ed,
      text: ed?.textContent?.trim(),
    };
  });
  console.log('State 2 (after click):', JSON.stringify(state2));
  await page.screenshot({ path: 'docs/diag-2-after-click.png' });

  // Try focus()
  console.log('--- Calling focus() ---');
  await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor') as HTMLElement;
    ed?.focus();
  });
  await sleep(500);

  const state3 = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    return {
      contenteditable: ed?.getAttribute('contenteditable'),
      focused: document.activeElement === ed,
    };
  });
  console.log('State 3 (after focus):', JSON.stringify(state3));

  // Try dispatchEvent focus/click
  console.log('--- Dispatching focus + click events ---');
  await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor') as HTMLElement;
    ed?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    ed?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ed?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  await sleep(500);

  const state4 = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    return {
      contenteditable: ed?.getAttribute('contenteditable'),
      focused: document.activeElement === ed || document.activeElement?.closest('.ql-editor') != null,
    };
  });
  console.log('State 4 (after events):', JSON.stringify(state4));
  await page.screenshot({ path: 'docs/diag-3-after-events.png' });

  // Try looking for the REAL input container (maybe there's a parent that handles clicks)
  console.log('--- Looking for all editable/input elements ---');
  const allInputs = await page.evaluate(() => {
    const result: any[] = [];
    // Check all contenteditable elements
    const editables = document.querySelectorAll('[contenteditable]');
    editables.forEach(el => {
      result.push({
        tag: el.tagName,
        ce: el.getAttribute('contenteditable'),
        class: el.className.toString().slice(0, 80),
        visible: (el as HTMLElement).offsetHeight > 0,
        text: el.textContent?.trim()?.slice(0, 50),
      });
    });
    // Check input/textarea elements
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(el => {
      result.push({
        tag: el.tagName,
        type: (el as HTMLInputElement).type,
        visible: (el as HTMLElement).offsetHeight > 0,
        value: (el as HTMLInputElement).value?.slice(0, 50),
      });
    });
    return result;
  });
  console.log('All input elements:', JSON.stringify(allInputs, null, 2));

  // Try the Quill container parent
  console.log('--- Checking Quill container hierarchy ---');
  const quillInfo = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    if (!ed) return 'No .ql-editor found';
    const parents: string[] = [];
    let el = ed.parentElement;
    for (let i = 0; i < 5 && el; i++) {
      parents.push(`${el.tagName}.${el.className.toString().slice(0, 60)}`);
      el = el.parentElement;
    }
    // Check if there's a Quill instance
    const qlContainer = document.querySelector('.ql-container');
    return {
      parents,
      qlContainerCE: qlContainer?.getAttribute('contenteditable'),
      qlContainerClass: qlContainer?.className,
    };
  });
  console.log('Quill hierarchy:', JSON.stringify(quillInfo, null, 2));

  // Try setting contenteditable directly and then typing
  console.log('--- Force contenteditable=true and type ---');
  await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor') as HTMLElement;
    if (ed) {
      ed.setAttribute('contenteditable', 'true');
      ed.focus();
    }
  });
  await sleep(300);

  // Now type with keyboard
  await page.keyboard.type('test123', { delay: 30 });
  await sleep(500);

  const state5 = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    return {
      contenteditable: ed?.getAttribute('contenteditable'),
      text: ed?.textContent?.trim(),
    };
  });
  console.log('State 5 (after force CE + type):', JSON.stringify(state5));
  await page.screenshot({ path: 'docs/diag-4-after-force-type.png' });

  // Check if there's a send button and its state
  const sendBtnInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const relevant = btns.filter(b => {
      const label = b.getAttribute('aria-label') || b.textContent || '';
      return /send|submit/i.test(label);
    });
    return relevant.map(b => ({
      tag: 'button',
      label: b.getAttribute('aria-label') || b.textContent?.trim()?.slice(0, 40),
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      visible: b.offsetHeight > 0,
      classes: b.className.slice(0, 80),
    }));
  });
  console.log('Send buttons:', JSON.stringify(sendBtnInfo, null, 2));

  browser.close().catch(() => {});
}

main().catch(console.error);
