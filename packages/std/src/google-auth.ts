/**
 * Universal Google OAuth Auth Module
 *
 * Detects "Sign in with Google" on any page, clicks through the
 * Google account picker, handles consent screens, and waits for
 * the redirect back to the originating site.
 *
 * Works via the PingOS extension bridge — operates on a real
 * browser tab that the user is already logged into Google on.
 */

import { logGateway } from './gw-log.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleAuthOpts {
  /** Gateway base URL (e.g. http://localhost:3500) */
  gateway: string;
  /** Device/tab ID to operate on */
  deviceId: string;
  /** Preferred Google account email — used to pick the right account in the chooser */
  email?: string;
  /** Max time (ms) to wait for the entire flow (default 30 s) */
  timeoutMs?: number;
}

export interface GoogleAuthResult {
  ok: boolean;
  /** The URL the browser landed on after auth completed */
  finalUrl?: string;
  /** Which Google account was selected */
  selectedEmail?: string;
  /** Human-readable description of what happened */
  detail?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers — HTTP calls to the local gateway
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT = 15_000;

async function gw(url: string, body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function devOp(gateway: string, deviceId: string, op: string, payload: Record<string, unknown> = {}): Promise<any> {
  return gw(`${gateway}/v1/dev/${deviceId}/${op}`, payload);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function currentUrl(gateway: string, deviceId: string): Promise<string> {
  const res = await devOp(gateway, deviceId, 'eval', { expression: 'location.href' });
  const raw = res?.result ?? res;
  return typeof raw === 'string' ? raw : String(raw ?? '');
}

// ---------------------------------------------------------------------------
// Google Sign-In button detection
// ---------------------------------------------------------------------------

/** JS expression that finds and clicks a Google sign-in button on any page. */
const FIND_AND_CLICK_GOOGLE_SIGNIN = `(() => {
  // Strategy 1: buttons/links with explicit Google OAuth data attributes
  const dataBtn = document.querySelector(
    '[data-provider="google"], [data-social="google"], [data-action*="google"], ' +
    'button[class*="google" i], a[class*="google" i], ' +
    '[id*="google-signin" i], [id*="google-login" i], [id*="google-auth" i]'
  );
  if (dataBtn) { dataBtn.click(); return { clicked: true, strategy: 'data-attr' }; }

  // Strategy 2: buttons/links containing a Google logo image
  const googleImgs = document.querySelectorAll('img[src*="google"], img[alt*="Google" i], svg[aria-label*="Google" i]');
  for (const img of googleImgs) {
    const parent = img.closest('button, a, [role="button"]');
    if (parent) { parent.click(); return { clicked: true, strategy: 'img-parent' }; }
  }

  // Strategy 3: text-based — "Sign in with Google", "Continue with Google", "Log in with Google"
  const textCandidates = document.querySelectorAll('button, a, [role="button"], div[tabindex]');
  for (const el of textCandidates) {
    const t = (el.textContent || '').trim();
    if (/\\b(sign|log|continue|connect)\\s+(in|up|on)?\\s*(with)?\\s*google\\b/i.test(t)) {
      el.click();
      return { clicked: true, strategy: 'text-match', text: t.substring(0, 60) };
    }
  }

  // Strategy 4: Google's own GSI button (rendered in iframe or custom element)
  const gsiBtn = document.querySelector(
    '#credential_picker_container iframe, .g_id_signin, [data-login_uri], ' +
    'div[id="g_id_onload"], .google-sign-in-button'
  );
  if (gsiBtn) {
    const clickable = gsiBtn.closest('[role="button"]') || gsiBtn.querySelector('[role="button"]') || gsiBtn;
    clickable.click();
    return { clicked: true, strategy: 'gsi-widget' };
  }

  return { clicked: false };
})()`;

// ---------------------------------------------------------------------------
// Google account picker handling
// ---------------------------------------------------------------------------

/** Detect we're on the Google account chooser and pick the right account. */
function buildAccountPickerExpression(email?: string): string {
  return `(() => {
    // Are we on a Google accounts page?
    if (!location.hostname.includes('accounts.google.com')) {
      return { onPicker: false };
    }

    // Detect what kind of page this is
    const pageHTML = document.body.innerText || '';

    // "Choose an account" / account picker
    const accountItems = document.querySelectorAll(
      '[data-identifier], [data-email], .JDAKTe, ' +
      'li[role="link"], div[data-authuser]'
    );

    if (accountItems.length > 0) {
      const accounts = [];
      for (const item of accountItems) {
        const id = item.getAttribute('data-identifier') ||
                   item.getAttribute('data-email') ||
                   (item.querySelector('[data-email]')?.getAttribute('data-email')) ||
                   '';
        accounts.push(id);
      }

      ${email ? `
      // Try to pick the preferred email
      const preferred = '${email}'.toLowerCase();
      for (const item of accountItems) {
        const id = (
          item.getAttribute('data-identifier') ||
          item.getAttribute('data-email') ||
          item.textContent || ''
        ).toLowerCase();
        if (id.includes(preferred)) {
          item.click();
          return { onPicker: true, action: 'selected', email: preferred, accounts };
        }
      }
      // Preferred not found — pick first
      accountItems[0].click();
      return { onPicker: true, action: 'selected-first', accounts, note: 'preferred not found' };
      ` : `
      // No preferred email — pick first account
      accountItems[0].click();
      return { onPicker: true, action: 'selected-first', accounts };
      `}
    }

    // "Use another account" link — could appear if only 1 account shown
    const useAnother = document.querySelector('[data-use-another-account], #identifierLink');
    if (useAnother && !${!!email}) {
      // No specific email and no accounts to choose — page might be asking for email input
      return { onPicker: true, action: 'needs-email-input' };
    }

    return { onPicker: true, action: 'unknown-page', text: pageHTML.substring(0, 200) };
  })()`;
}

// ---------------------------------------------------------------------------
// Consent / permissions screen handling
// ---------------------------------------------------------------------------

const HANDLE_CONSENT = `(() => {
  if (!location.hostname.includes('accounts.google.com')) {
    return { onConsent: false };
  }

  // "Allow" / "Continue" buttons on consent screen
  const allowBtns = document.querySelectorAll(
    '#submit_approve_access, ' +
    'button[id*="allow" i], button[id*="accept" i], button[id*="continue" i], ' +
    '[data-idom-class*="primary"], ' +
    'button[jsname="LgbsSe"]'  // Google's Material "Continue" button
  );

  for (const btn of allowBtns) {
    const text = (btn.textContent || '').trim().toLowerCase();
    if (/allow|continue|accept|next|agree/i.test(text) || btn.id.includes('allow') || btn.id.includes('continue')) {
      btn.click();
      return { onConsent: true, action: 'approved', buttonText: text };
    }
  }

  // Check for "Next" on email/password entry pages
  const nextBtns = document.querySelectorAll(
    '#identifierNext, #passwordNext, button[jsname="LgbsSe"]'
  );
  for (const btn of nextBtns) {
    // Only click if not disabled
    if (!btn.hasAttribute('disabled')) {
      btn.click();
      return { onConsent: true, action: 'clicked-next', id: btn.id };
    }
  }

  // Checkbox-style consent (check all boxes then click continue)
  const unchecked = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
  if (unchecked.length > 0) {
    for (const cb of unchecked) cb.click();
    return { onConsent: true, action: 'checked-boxes', count: unchecked.length };
  }

  return { onConsent: true, action: 'no-action-needed' };
})()`;

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

export async function googleAuth(opts: GoogleAuthOpts): Promise<GoogleAuthResult> {
  const { gateway, deviceId, email, timeoutMs = 30_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  const steps: string[] = [];

  try {
    // 1. Remember the origin URL so we know when we've returned
    const originUrl = await currentUrl(gateway, deviceId);
    const originHost = new URL(originUrl).hostname;
    steps.push(`origin: ${originUrl}`);

    logGateway('[google-auth] starting', { originUrl, email, deviceId });

    // 2. Find and click the Google sign-in button on the current page
    const clickRes = await devOp(gateway, deviceId, 'eval', { expression: FIND_AND_CLICK_GOOGLE_SIGNIN });
    const clickData = clickRes?.result ?? clickRes;

    if (!clickData?.clicked) {
      // Fallback: try using the act op with natural language
      try {
        await devOp(gateway, deviceId, 'act', { instruction: 'Click the "Sign in with Google" button' });
        steps.push('clicked via act fallback');
      } catch {
        return { ok: false, error: 'No Google sign-in button found on page', detail: JSON.stringify(clickData) };
      }
    } else {
      steps.push(`clicked: ${clickData.strategy}`);
    }

    // 3. Wait for navigation to Google accounts
    await sleep(2000);

    // 4. Poll-loop: handle Google's multi-step flow
    let iteration = 0;
    const MAX_ITERATIONS = 15;

    while (Date.now() < deadline && iteration < MAX_ITERATIONS) {
      iteration++;
      const url = await currentUrl(gateway, deviceId);

      // Check if we've returned to the origin site
      try {
        const host = new URL(url).hostname;
        if (host === originHost || (!host.includes('google.com') && !host.includes('accounts.google'))) {
          logGateway('[google-auth] returned to origin', { url, iteration });
          steps.push(`returned to ${host}`);
          return {
            ok: true,
            finalUrl: url,
            selectedEmail: email,
            detail: `Auth completed in ${iteration} steps: ${steps.join(' → ')}`,
          };
        }
      } catch {
        // URL parse failed — keep going
      }

      // We're still on accounts.google.com — figure out what page we're on
      if (url.includes('accounts.google.com')) {
        // Try account picker first
        const pickerExpr = buildAccountPickerExpression(email);
        const pickerRes = await devOp(gateway, deviceId, 'eval', { expression: pickerExpr });
        const picker = pickerRes?.result ?? pickerRes;

        if (picker?.onPicker && picker.action?.startsWith('selected')) {
          steps.push(`account-picker: ${picker.action} (${picker.email || 'first'})`);
          await sleep(2000);
          continue;
        }

        if (picker?.onPicker && picker.action === 'needs-email-input' && email) {
          // Type the email into the identifier field
          try {
            await devOp(gateway, deviceId, 'type', { text: email, selector: 'input[type="email"], #identifierId' });
            await sleep(500);
            await devOp(gateway, deviceId, 'eval', {
              expression: `(document.querySelector('#identifierNext button, #identifierNext') || {}).click && document.querySelector('#identifierNext button, #identifierNext').click()`,
            });
            steps.push('typed-email');
            await sleep(2000);
            continue;
          } catch {
            // Fall through to consent handling
          }
        }

        // Try consent / "Allow" / "Continue" buttons
        const consentRes = await devOp(gateway, deviceId, 'eval', { expression: HANDLE_CONSENT });
        const consent = consentRes?.result ?? consentRes;

        if (consent?.onConsent && consent.action !== 'no-action-needed') {
          steps.push(`consent: ${consent.action}`);
          await sleep(2000);
          continue;
        }

        // Nothing obvious to click — might be loading. Wait and retry.
        steps.push(`waiting (iteration ${iteration})`);
        await sleep(1500);
        continue;
      }

      // We're not on Google and not on origin — maybe an intermediate redirect
      steps.push(`intermediate: ${url.substring(0, 80)}`);
      await sleep(1500);
    }

    // Timed out or max iterations
    const finalUrl = await currentUrl(gateway, deviceId);
    logGateway('[google-auth] flow ended', { finalUrl, iteration, steps });

    // Check if we actually ended up authenticated even if not on origin
    if (!finalUrl.includes('accounts.google.com')) {
      return {
        ok: true,
        finalUrl,
        selectedEmail: email,
        detail: `Flow completed (may need verification): ${steps.join(' → ')}`,
      };
    }

    return {
      ok: false,
      finalUrl,
      error: 'Auth flow did not complete in time',
      detail: steps.join(' → '),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logGateway('[google-auth] error', { error: msg, steps });
    return { ok: false, error: msg, detail: steps.join(' → ') };
  }
}

// ---------------------------------------------------------------------------
// Quick check: is the current page authenticated via Google?
// ---------------------------------------------------------------------------

export async function checkGoogleAuth(gateway: string, deviceId: string): Promise<{
  authenticated: boolean;
  email?: string;
  detail?: string;
}> {
  const res = await devOp(gateway, deviceId, 'eval', {
    expression: `(() => {
      // Check for common "signed in" indicators
      // 1. Google avatar / account menu
      const avatar = document.querySelector(
        'img[data-user-email], a[aria-label*="Account" i], ' +
        'a[href*="SignOutOptions"], [data-ogsr-up], ' +
        'img[class*="avatar" i][src*="googleusercontent"]'
      );
      if (avatar) {
        const email = avatar.getAttribute('data-user-email') || '';
        return { authenticated: true, email, via: 'avatar' };
      }

      // 2. Check for sign-in buttons (means NOT authenticated)
      const signInBtn = document.querySelector(
        '[data-provider="google"], button[class*="google-sign" i], ' +
        'a[href*="accounts.google.com/o/oauth2"], ' +
        'a[href*="accounts.google.com/signin"]'
      );
      if (signInBtn) {
        return { authenticated: false, via: 'signin-button-present' };
      }

      // 3. Check page-specific patterns
      const url = location.href;
      if (url.includes('mail.google.com') || url.includes('calendar.google.com') ||
          url.includes('docs.google.com') || url.includes('drive.google.com')) {
        // On a Google app — if we got here without redirect, we're authed
        return { authenticated: true, via: 'google-app-loaded' };
      }

      return { authenticated: false, via: 'no-indicators' };
    })()`,
  });

  const data = res?.result ?? res;
  return {
    authenticated: !!data?.authenticated,
    email: data?.email || undefined,
    detail: data?.via || undefined,
  };
}
