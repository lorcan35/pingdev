// download — Manage Downloads
import type { BridgeResponse } from '../types';
import { findElement, sleep } from './helpers';

interface DownloadCommand {
  url?: string;
  selector?: string;
  savePath?: string;
}

export async function handleDownload(command: DownloadCommand): Promise<BridgeResponse> {
  const { url, selector, savePath } = command;

  if (selector) {
    // Click a download link/button
    const el = findElement(selector);
    if (!el) return { success: false, error: `Element not found: ${selector}` };

    const href = el.getAttribute('href');
    if (href) {
      return triggerDownload(href, savePath);
    }

    // Click and hope it triggers a download
    (el as HTMLElement).click();
    await sleep(500);
    return {
      success: true,
      data: { downloaded: true, method: 'click', selector },
    };
  }

  if (url) {
    return triggerDownload(url, savePath);
  }

  return { success: false, error: 'Provide either url or selector' };
}

function triggerDownload(url: string, savePath?: string): BridgeResponse {
  const a = document.createElement('a');
  a.href = url;
  a.download = savePath || extractFilename(url);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  return {
    success: true,
    data: {
      downloaded: true,
      url,
      fileName: a.download,
      method: 'anchor',
    },
  };
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url, window.location.href).pathname;
    const parts = pathname.split('/');
    return parts[parts.length - 1] || 'download';
  } catch {
    return 'download';
  }
}
