/**
 * A2 Diagnostic: Connect to the browser where Deep Research just completed
 * and explore the DOM to find where the research report content lives.
 */
import { BrowserAdapter } from '../src/browser/adapter.js';

async function main() {
  const adapter = new BrowserAdapter();
  await adapter.connect();
  const page = adapter.page!;

  console.log('=== DOM DIAGNOSTIC ===');
  console.log('URL:', page.url());

  // 1. Check all .model-response-text containers
  const modelResponses = await page.evaluate(() => {
    const containers = document.querySelectorAll('.model-response-text');
    return Array.from(containers).map((el, i) => ({
      index: i,
      textLen: (el.textContent?.trim() ?? '').length,
      preview: (el.textContent?.trim() ?? '').slice(0, 200),
      classes: el.className,
      tagName: el.tagName,
    }));
  });
  console.log('\n--- .model-response-text containers ---');
  console.log(JSON.stringify(modelResponses, null, 2));

  // 2. Check for any large text blocks on the page
  const largeBlocks = await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    const blocks: {tag: string, class: string, textLen: number, preview: string}[] = [];
    for (const el of allEls) {
      const text = el.textContent?.trim() ?? '';
      // Only direct text content (not inherited from children)
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim() ?? '')
        .join(' ');
      if (text.length > 500 && directText.length > 100) {
        blocks.push({
          tag: el.tagName,
          class: el.className?.slice(0, 100) ?? '',
          textLen: text.length,
          preview: text.slice(0, 200),
        });
      }
    }
    return blocks.slice(0, 10);
  });
  console.log('\n--- Large text blocks (>500 chars) ---');
  console.log(JSON.stringify(largeBlocks, null, 2));

  // 3. Look for research-specific elements
  const researchEls = await page.evaluate(() => {
    const selectors = [
      '[class*="research"]',
      '[class*="report"]',
      '[class*="document"]',
      '[class*="article"]',
      '[class*="content-area"]',
      '[role="article"]',
      '[role="document"]',
      'markdown-output-wrapper',
      '[class*="markdown"]',
      '[class*="gemini-response"]',
    ];
    const results: {selector: string, count: number, textLens: number[], previews: string[]}[] = [];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results.push({
          selector: sel,
          count: els.length,
          textLens: Array.from(els).map(e => (e.textContent?.trim() ?? '').length),
          previews: Array.from(els).map(e => (e.textContent?.trim() ?? '').slice(0, 100)),
        });
      }
    }
    return results;
  });
  console.log('\n--- Research-specific elements ---');
  console.log(JSON.stringify(researchEls, null, 2));

  // 4. Check for clickable "View report" or "Open report" buttons
  const buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"]'));
    return btns
      .filter(el => {
        const text = el.textContent?.trim() ?? '';
        const aria = el.getAttribute('aria-label') ?? '';
        return text.length > 0 && text.length < 100;
      })
      .map(el => ({
        tag: el.tagName,
        text: (el.textContent?.trim() ?? '').slice(0, 80),
        ariaLabel: el.getAttribute('aria-label') ?? '',
        role: el.getAttribute('role') ?? '',
        href: el.getAttribute('href') ?? '',
      }))
      .slice(0, 30);
  });
  console.log('\n--- Clickable elements ---');
  console.log(JSON.stringify(buttons, null, 2));

  // 5. Get the full page text (truncated)
  const fullText = await page.evaluate(() => {
    return document.body?.innerText?.slice(0, 3000) ?? '';
  });
  console.log('\n--- Full page text (first 3000 chars) ---');
  console.log(fullText);

  await adapter.disconnect();
}

main().catch(console.error);
