/**
 * A3: Video Download Extraction
 *
 * Tests whether video URLs can be extracted from Gemini's Create Videos tool output.
 *
 * KEY FINDING: When Create Videos is active, Quill editor has ql-disabled class
 * and contenteditable="false". Must force-enable before typing.
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const CDP_URL = 'http://127.0.0.1:18800';
const GEMINI_URL = 'https://gemini.google.com/u/1/app';
const TIMEOUT = 600_000;
const RESULTS_FILE = 'docs/ASSUMPTION_TESTS.md';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('[A3] Starting Video Download Extraction test...');

  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
  const ctx = browser.contexts()[0]!;
  const page = ctx.pages().find(p => p.url().includes('gemini.google.com')) ?? ctx.pages()[0]!;

  const evidence: string[] = [];
  let verdict = 'FAIL';

  try {
    // Step 1: Fresh chat
    console.log('[A3] Navigating to fresh chat...');
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(3000);
    await page.keyboard.press('Escape');
    await sleep(500);

    // Step 2: Activate Create Videos
    console.log('[A3] Activating Create Videos tool...');
    await page.locator('role=button[name="Tools"]').first().click();
    await sleep(500);
    await page.locator('role=menuitemcheckbox[name=/Create videos/i]').first().click();
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(1000);

    const chipVisible = await page.locator('role=button[name="Deselect Video"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    evidence.push(`Tool activation: ${chipVisible ? 'confirmed' : 'failed'}`);

    // Step 3: Force-enable Quill editor and type prompt
    const prompt = 'A cat playing with yarn in a sunlit room';
    console.log(`[A3] Force-enabling editor and typing: "${prompt}"`);

    await page.evaluate(() => {
      // Remove ql-disabled from container
      const container = document.querySelector('.ql-container');
      if (container) container.classList.remove('ql-disabled');
      // Set contenteditable=true on editor
      const editor = document.querySelector('.ql-editor') as HTMLElement;
      if (editor) {
        editor.setAttribute('contenteditable', 'true');
        editor.classList.remove('ql-blank');
        editor.focus();
      }
    });
    await sleep(300);

    await page.keyboard.type(prompt, { delay: 15 });
    await sleep(500);

    // Verify text
    const inputText = await page.evaluate(() => {
      return document.querySelector('.ql-editor')?.textContent?.trim() ?? '';
    });
    console.log(`[A3] Input verified: "${inputText.slice(0, 60)}"`);
    evidence.push(`Input text: "${inputText.slice(0, 50)}"`);

    // Step 4: Submit — force-show and enable the send button
    console.log('[A3] Submitting prompt...');

    // Make the send button visible and clickable
    const sendEnabled = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
      if (btn) {
        btn.style.display = '';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
        btn.removeAttribute('aria-disabled');
        btn.disabled = false;
        // Also check parent visibility
        let parent = btn.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none') (parent as HTMLElement).style.display = '';
          if (style.visibility === 'hidden') (parent as HTMLElement).style.visibility = 'visible';
          parent = parent.parentElement;
        }
        return true;
      }
      return false;
    });
    console.log(`[A3] Send button enabled: ${sendEnabled}`);

    if (sendEnabled) {
      // Try clicking the send button
      const sendBtn = page.locator('button[aria-label="Send message"]').first();
      await sendBtn.click({ force: true });
      console.log('[A3] Clicked send button');
    } else {
      // Fallback: press Enter
      await page.keyboard.press('Enter');
      console.log('[A3] Pressed Enter');
    }
    await sleep(2000);

    // Check if generation started
    const genStarted = await page.locator('role=button[name="Stop response"]').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    console.log(`[A3] Generation started: ${genStarted}`);
    evidence.push(`Generation started: ${genStarted}`);

    if (!genStarted) {
      // Check if response already appeared (fast response)
      const quickDone = await page.locator('role=button[name="Good response"]').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      if (quickDone) {
        console.log('[A3] Quick response (no stop button seen)');
        evidence.push('Response appeared quickly (no generating phase seen)');
      } else {
        // Last resort: try Enter on the input
        console.log('[A3] No generation detected. Trying Enter key on input...');
        await page.locator('.ql-editor').first().click({ force: true });
        await sleep(300);
        await page.keyboard.press('Enter');
        await sleep(5000);
        const genRetry = await page.locator('role=button[name="Stop response"]').first()
          .isVisible({ timeout: 5000 }).catch(() => false);
        console.log(`[A3] Generation after Enter retry: ${genRetry}`);
      }
    }

    // Step 5: Wait for completion (up to 10 min)
    const startTime = Date.now();
    let responseCompleted = false;

    while (Date.now() - startTime < TIMEOUT) {
      const isGen = await page.locator('role=button[name="Stop response"]').first()
        .isVisible({ timeout: 1000 }).catch(() => false);
      const isDone = await page.locator('role=button[name="Good response"]').first()
        .isVisible({ timeout: 1000 }).catch(() => false);
      const videoCount = await page.evaluate(() =>
        document.querySelectorAll('video').length
      ).catch(() => 0);

      if (videoCount > 0) {
        console.log(`[A3] VIDEO DETECTED! Count: ${videoCount}`);
        responseCompleted = true;
        break;
      }

      if (isDone && !isGen) {
        console.log('[A3] Response complete');
        responseCompleted = true;
        break;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 30 === 0) {
        const partial = await page.evaluate(() => {
          const c = document.querySelectorAll('.model-response-text');
          return c.length > 0 ? c[c.length - 1]!.textContent?.trim()?.slice(0, 100) ?? '' : '';
        }).catch(() => '');
        console.log(`[A3] ${elapsed}s: gen=${isGen}, done=${isDone}, videos=${videoCount}, text="${partial}"`);
      }
      await sleep(3000);
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    evidence.push(`Wait time: ${totalTime}s, completed: ${responseCompleted}`);

    // Step 6: DOM inspection
    await sleep(3000);

    const responseText = await page.evaluate(() => {
      const c = document.querySelectorAll('.model-response-text');
      return c.length > 0 ? c[c.length - 1]!.textContent?.trim() ?? '' : '';
    }).catch(() => '');
    console.log(`[A3] Response (${responseText.length}ch): ${responseText.slice(0, 300)}`);
    evidence.push(`Response text (${responseText.length} chars): ${responseText.slice(0, 200)}`);

    const snapshot = await page.evaluate(() => {
      const data: Record<string, any> = {};
      const videos = document.querySelectorAll('video');
      data.videoCount = videos.length;
      data.videoDetails = Array.from(videos).map(v => ({
        src: v.src, currentSrc: v.currentSrc, poster: v.poster,
      }));
      const sources = document.querySelectorAll('source');
      data.sources = Array.from(sources).map(s => ({ src: s.src, type: s.type }));
      const blobEls = document.querySelectorAll('[src^="blob:"], [href^="blob:"]');
      data.blobUrls = Array.from(blobEls).map(el => el.getAttribute('src') || el.getAttribute('href'));
      const downloads = document.querySelectorAll('a[download], [aria-label*="ownload" i]');
      data.downloadLinks = Array.from(downloads).map(el => ({
        href: el.getAttribute('href'), label: el.getAttribute('aria-label') ?? el.textContent?.trim()?.slice(0, 50),
      }));
      const html = document.body.innerHTML;
      const urlPat = /https?:\/\/[^\s"'<>]+\.(mp4|webm|mov)[^\s"'<>]*/gi;
      data.videoUrls = [...new Set(html.match(urlPat) || [])];
      const vidEls = document.querySelectorAll('[class*="video" i], [class*="player" i]');
      data.videoRelated = Array.from(vidEls).map(el => ({
        tag: el.tagName, cls: el.className.toString().slice(0, 80),
      }));
      data.iframes = document.querySelectorAll('iframe').length;
      const imgs = document.querySelectorAll('.model-response-text img');
      data.images = Array.from(imgs).map(img => ({ src: (img as HTMLImageElement).src?.slice(0, 120) }));
      return data;
    });

    console.log('[A3] Snapshot:', JSON.stringify(snapshot, null, 2));

    evidence.push(`Video elements: ${snapshot.videoCount}`);
    if (snapshot.videoDetails?.length > 0) evidence.push(`Video details: ${JSON.stringify(snapshot.videoDetails)}`);
    if (snapshot.sources?.length > 0) evidence.push(`Sources: ${JSON.stringify(snapshot.sources)}`);
    evidence.push(`Blob URLs: ${snapshot.blobUrls?.length ?? 0}`);
    evidence.push(`Download links: ${snapshot.downloadLinks?.length ?? 0}`);
    if (snapshot.downloadLinks?.length > 0) evidence.push(`Downloads: ${JSON.stringify(snapshot.downloadLinks)}`);
    evidence.push(`Video URLs in HTML: ${snapshot.videoUrls?.length ?? 0}`);
    if (snapshot.videoUrls?.length > 0) evidence.push(`URLs: ${snapshot.videoUrls.join(', ')}`);
    evidence.push(`Video-related elements: ${snapshot.videoRelated?.length ?? 0}`);
    if (snapshot.videoRelated?.length > 0) evidence.push(`Related: ${JSON.stringify(snapshot.videoRelated)}`);
    evidence.push(`Iframes: ${snapshot.iframes}`);
    if (snapshot.images?.length > 0) evidence.push(`Images: ${JSON.stringify(snapshot.images)}`);

    try { await page.screenshot({ path: 'docs/a3-video-screenshot.png', fullPage: true }); } catch {}

    const hasVideo = snapshot.videoCount > 0 || (snapshot.sources?.length ?? 0) > 0 ||
      (snapshot.blobUrls?.length ?? 0) > 0 || (snapshot.videoUrls?.length ?? 0) > 0;
    if (hasVideo) verdict = 'PASS';

    // Deactivate
    try {
      const d = page.locator('role=button[name="Deselect Video"]').first();
      if (await d.isVisible({ timeout: 2000 }).catch(() => false)) {
        await d.click();
        await sleep(500);
      }
    } catch {}

  } catch (err) {
    console.error('[A3] Error:', err);
    evidence.push(`Error: ${String(err)}`);
  } finally {
    browser.close().catch(() => {});
  }

  const result = `
## A3: Video Download Extraction — ${verdict}

**Date:** ${new Date().toISOString()}

**Evidence:**
${evidence.map(e => `- ${e}`).join('\n')}

---

`;
  appendFileSync(RESULTS_FILE, result);
  console.log(`\n[A3] VERDICT: ${verdict}`);
}

main().catch(err => {
  console.error('[A3] Fatal:', err);
  appendFileSync(RESULTS_FILE, `\n## A3: Video Download Extraction — FAIL\n\n**Date:** ${new Date().toISOString()}\n\n**Evidence:**\n- Fatal error: ${String(err)}\n\n---\n\n`);
  process.exit(1);
});
