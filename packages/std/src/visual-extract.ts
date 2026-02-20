// Visual Extract — screenshot-based extraction using vision models
// Triggered when DOM extract returns empty and fallback: "visual" is set,
// or explicitly via strategy: "visual", or for canvas/SVG content.

import type { ExtensionBridge } from './ext-bridge.js';
import { callLLMVision } from './llm.js';
import { logGateway } from './gw-log.js';

export interface VisualExtractOptions {
  deviceId: string;
  schema?: Record<string, string>;
  query?: string;
  strategy: 'visual';
}

export interface VisualExtractResult {
  data: Record<string, unknown>;
  _meta: {
    strategy: 'visual';
    confidence: number;
    duration_ms: number;
    model?: string;
  };
}

/**
 * Extract structured data from a page by taking a screenshot and using a vision model.
 *
 * Flow:
 * 1. Take screenshot of the viewport or specified element
 * 2. Send to vision-capable LLM
 * 3. Prompt with schema description for structured extraction
 * 4. Parse LLM response into JSON
 */
export async function visualExtract(
  extBridge: ExtensionBridge,
  opts: VisualExtractOptions,
): Promise<VisualExtractResult> {
  const { deviceId, schema, query } = opts;
  const startMs = Date.now();

  // 1. Take a screenshot
  let screenshotData: string | null = null;
  try {
    const screenshotResult = await extBridge.callDevice({
      deviceId,
      op: 'screenshot',
      payload: {},
      timeoutMs: 10_000,
    });

    const ssObj = screenshotResult as Record<string, unknown>;
    screenshotData = (ssObj?.data as string) ??
      (ssObj?.screenshot as string) ??
      (ssObj?.image as string) ??
      null;

    // Handle nested data object
    if (!screenshotData && ssObj?.data && typeof ssObj.data === 'object') {
      const dataObj = ssObj.data as Record<string, unknown>;
      screenshotData = (dataObj?.screenshot as string) ??
        (dataObj?.image as string) ??
        (dataObj?.dataUrl as string) ??
        null;
    }
  } catch (err) {
    logGateway('[visual-extract] screenshot failed', { error: String(err) });
  }

  // 2. Build the extraction prompt
  let fieldDescription = '';
  if (schema && Object.keys(schema).length > 0) {
    fieldDescription = Object.entries(schema)
      .map(([key, desc]) => `- "${key}": ${desc}`)
      .join('\n');
  } else if (query) {
    fieldDescription = `Extract: ${query}`;
  } else {
    fieldDescription = 'Extract all visible structured data (titles, prices, descriptions, dates, etc.)';
  }

  const prompt = `Look at this webpage screenshot and extract the following data as JSON:

${fieldDescription}

Return ONLY a valid JSON object with the requested fields. If a field is not visible, use null.
Do not include explanations.

JSON:`;

  // 3. Call the LLM (vision model when screenshot available, text fallback otherwise)
  let llmResponse: string;
  try {
    if (screenshotData) {
      // Send screenshot to vision model
      llmResponse = await callLLMVision(prompt, {
        images: [screenshotData],
        model: 'anthropic/claude-sonnet-4',
        maxTokens: 2000,
        temperature: 0.1,
        systemPrompt: 'You are a data extraction expert. Extract structured data from webpage screenshots. Return only valid JSON.',
      });
    } else {
      // No screenshot — fall back to text extraction
      let pageText = '';
      try {
        const evalResult = await extBridge.callDevice({
          deviceId,
          op: 'eval',
          payload: { expression: 'document.body.innerText.substring(0, 4000)' },
          timeoutMs: 5_000,
        });
        const evalObj = evalResult as Record<string, unknown>;
        pageText = (evalObj?.data as string) ?? (evalObj?.result as string) ?? '';
        if (typeof pageText === 'object') {
          pageText = (pageText as Record<string, unknown>)?.result as string ?? '';
        }
      } catch { /* ignore */ }

      const contextPrompt = `Given this visible text from a webpage, ${prompt}\n\nVisible text:\n${pageText}`;

      llmResponse = await callLLMVision(contextPrompt, {
        maxTokens: 1000,
        temperature: 0.1,
        systemPrompt: 'You are a data extraction expert. Extract structured data from webpage content. Return only valid JSON.',
      });
    }
  } catch (err) {
    logGateway('[visual-extract] LLM call failed', { error: String(err) });
    return {
      data: {},
      _meta: {
        strategy: 'visual',
        confidence: 0,
        duration_ms: Date.now() - startMs,
      },
    };
  }

  // 4. Parse the LLM response into JSON
  let extractedData: Record<string, unknown> = {};
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extractedData = JSON.parse(jsonMatch[0]);
    }
  } catch {
    logGateway('[visual-extract] JSON parse failed', { response: llmResponse.slice(0, 200) });
  }

  const fieldCount = Object.keys(extractedData).length;
  const confidence = screenshotData
    ? Math.min(0.9, fieldCount * 0.2)   // vision-based: higher confidence
    : Math.min(0.8, fieldCount * 0.15); // text-fallback: lower confidence

  return {
    data: extractedData,
    _meta: {
      strategy: 'visual',
      confidence,
      duration_ms: Date.now() - startMs,
      model: screenshotData ? 'anthropic/claude-sonnet-4' : undefined,
    },
  };
}
