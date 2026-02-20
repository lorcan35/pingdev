// capture — Rich Page Capture
import type { BridgeResponse } from '../types';

type CaptureFormat = 'pdf' | 'mhtml' | 'har' | 'dom';

interface CaptureCommand {
  format: CaptureFormat;
}

export async function handleCapture(command: CaptureCommand): Promise<BridgeResponse> {
  const { format } = command;
  if (!format) return { success: false, error: 'Missing format' };

  switch (format) {
    case 'dom':
      return captureDom();
    case 'pdf':
    case 'mhtml':
    case 'har':
      // These require CDP / background script support
      return {
        success: false,
        error: `${format} capture requires CDP (use via background script). Only "dom" is supported in content script.`,
      };
    default:
      return { success: false, error: `Unknown capture format: ${format}` };
  }
}

function captureDom(): BridgeResponse {
  const html = document.documentElement.outerHTML;
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>`
    : '<!DOCTYPE html>';

  return {
    success: true,
    data: {
      format: 'dom',
      content: doctype + '\n' + html,
      url: window.location.href,
      title: document.title,
      size: html.length,
      timestamp: Date.now(),
    },
  };
}
