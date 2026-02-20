// upload — File Upload
import type { BridgeResponse } from '../types';
import { findElement } from './helpers';

interface UploadCommand {
  selector: string;
  filePath: string;
}

export async function handleUpload(command: UploadCommand): Promise<BridgeResponse> {
  const { selector, filePath } = command;
  if (!selector) return { success: false, error: 'Missing selector' };
  if (!filePath) return { success: false, error: 'Missing filePath' };

  const el = findElement(selector);
  if (!el) return { success: false, error: `Element not found: ${selector}` };

  if (!(el instanceof HTMLInputElement) || el.type !== 'file') {
    return { success: false, error: 'Element is not a file input' };
  }

  // File upload via content script is limited — we need CDP to set file input values.
  // Signal the background script / gateway to use CDP's DOM.setFileInputFiles.
  // For now, dispatch the request back as a CDP operation hint.
  return {
    success: false,
    error: 'File upload requires CDP. Use the gateway upload endpoint which sets files via DevTools Protocol.',
    data: {
      hint: 'cdp_required',
      cdpMethod: 'DOM.setFileInputFiles',
      selector,
      filePath,
    },
  };
}
