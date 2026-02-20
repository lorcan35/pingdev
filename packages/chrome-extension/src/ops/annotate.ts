// annotate — Visual Annotations
import type { BridgeResponse } from '../types';
import { findElement, isVisible } from './helpers';

interface AnnotationDef {
  selector: string;
  label?: string;
  color?: string;
  style?: 'box' | 'highlight' | 'arrow';
}

interface AnnotateCommand {
  annotations: AnnotationDef[];
}

const ANNOTATION_CLASS = '__pingos-annotation';
let annotationCounter = 0;

export async function handleAnnotate(command: AnnotateCommand): Promise<BridgeResponse> {
  const { annotations } = command;
  if (!annotations || !Array.isArray(annotations)) {
    return { success: false, error: 'Missing annotations array' };
  }

  // Remove previous annotations
  removeAnnotations();

  const results: Array<{ selector: string; success: boolean; error?: string }> = [];

  for (const ann of annotations) {
    const el = findElement(ann.selector);
    if (!el || !isVisible(el)) {
      results.push({ selector: ann.selector, success: false, error: 'Element not found or not visible' });
      continue;
    }

    addAnnotation(el, ann);
    results.push({ selector: ann.selector, success: true });
  }

  return {
    success: true,
    data: {
      annotated: true,
      count: results.filter(r => r.success).length,
      results,
    },
  };
}

function addAnnotation(el: Element, ann: AnnotationDef): void {
  const color = ann.color || '#ff0000';
  const style = ann.style || 'box';
  const rect = el.getBoundingClientRect();
  const id = `${ANNOTATION_CLASS}-${++annotationCounter}`;

  const overlay = document.createElement('div');
  overlay.className = ANNOTATION_CLASS;
  overlay.id = id;
  overlay.style.position = 'fixed';
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '99999';
  overlay.style.boxSizing = 'border-box';

  switch (style) {
    case 'box':
      overlay.style.border = `3px solid ${color}`;
      overlay.style.borderRadius = '4px';
      break;
    case 'highlight':
      overlay.style.backgroundColor = color;
      overlay.style.opacity = '0.25';
      break;
    case 'arrow':
      overlay.style.border = `3px solid ${color}`;
      overlay.style.borderRadius = '4px';
      // Add arrow indicator above the element
      const arrow = document.createElement('div');
      arrow.className = ANNOTATION_CLASS;
      arrow.style.position = 'fixed';
      arrow.style.left = `${rect.left + rect.width / 2 - 10}px`;
      arrow.style.top = `${rect.top - 20}px`;
      arrow.style.width = '0';
      arrow.style.height = '0';
      arrow.style.borderLeft = '10px solid transparent';
      arrow.style.borderRight = '10px solid transparent';
      arrow.style.borderTop = `15px solid ${color}`;
      arrow.style.pointerEvents = 'none';
      arrow.style.zIndex = '99999';
      document.body.appendChild(arrow);
      break;
  }

  // Add label if provided
  if (ann.label) {
    const label = document.createElement('div');
    label.className = ANNOTATION_CLASS;
    label.textContent = ann.label;
    label.style.position = 'fixed';
    label.style.left = `${rect.left}px`;
    label.style.top = `${rect.top - 24}px`;
    label.style.backgroundColor = color;
    label.style.color = '#fff';
    label.style.padding = '2px 6px';
    label.style.fontSize = '12px';
    label.style.fontFamily = 'sans-serif';
    label.style.fontWeight = 'bold';
    label.style.borderRadius = '3px';
    label.style.pointerEvents = 'none';
    label.style.zIndex = '100000';
    label.style.whiteSpace = 'nowrap';
    document.body.appendChild(label);
  }

  document.body.appendChild(overlay);
}

function removeAnnotations(): void {
  const existing = document.querySelectorAll(`.${ANNOTATION_CLASS}`);
  for (const el of Array.from(existing)) {
    el.remove();
  }
}
