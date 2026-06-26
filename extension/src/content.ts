import { CapturePayload, MessageToContent } from './types';
import { buildPayload } from './capture-core';

let pickerActive = false;
let highlightOverlay: HTMLElement | null = null;

// ── Element picker ─────────────────────────────────────────────────────────

function createOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;pointer-events:none;border:2px solid #7c5cfc;
    background:rgba(124,92,252,0.08);border-radius:3px;z-index:2147483647;
    transition:all 0.08s ease;`;
  document.body.appendChild(el);
  return el;
}

function positionOverlay(target: Element) {
  if (!highlightOverlay) return;
  const r = target.getBoundingClientRect();
  Object.assign(highlightOverlay.style, {
    top: `${r.top}px`, left: `${r.left}px`,
    width: `${r.width}px`, height: `${r.height}px`,
  });
}

function startPicker() {
  pickerActive = true;
  highlightOverlay = createOverlay();
  document.body.style.cursor = 'crosshair';
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click',     onPickerClick, true);
  document.addEventListener('keydown',   onEscape, true);
}

function stopPicker() {
  pickerActive = false;
  document.body.style.cursor = '';
  highlightOverlay?.remove();
  highlightOverlay = null;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('click',     onPickerClick, true);
  document.removeEventListener('keydown',   onEscape, true);
}

function onMouseOver(e: MouseEvent)  { if (pickerActive) positionOverlay(e.target as Element); }
function onEscape(e: KeyboardEvent)  { if (e.key === 'Escape') stopPicker(); }

function onPickerClick(e: MouseEvent) {
  e.preventDefault(); e.stopPropagation();
  stopPicker();
  const payload = buildPayload(e.target as Element, 'selected-element');
  chrome.runtime.sendMessage({ type: 'SAVE_CAPTURE', payload }).catch(() => {});
}

// ── Capture + send ─────────────────────────────────────────────────────────

async function captureAndSend(mode: 'full-page') {
  // Scroll to top so getBoundingClientRect + scrollY = document coords
  const savedX = window.scrollX;
  const savedY = window.scrollY;
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 80)); // wait for layout to settle

  const payload = buildPayload(document.body, mode);

  window.scrollTo(savedX, savedY); // restore

  chrome.runtime.sendMessage({ type: 'SAVE_CAPTURE', payload }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_ERROR',
        message: res?.message ?? 'Failed to save capture',
      }).catch(() => {});
    }
  });
}

// ── Message listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: MessageToContent, _sender, sendResponse) => {
  if (msg.type === 'CAPTURE_FULL_PAGE') {
    captureAndSend('full-page').catch((err) => {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_ERROR',
        message: err instanceof Error ? err.message : 'Capture failed',
      }).catch(() => {});
    });
    sendResponse({ ok: true });
  }
  if (msg.type === 'START_ELEMENT_PICKER') { startPicker(); sendResponse({ ok: true }); }
  if (msg.type === 'CANCEL_PICKER')        { stopPicker();  sendResponse({ ok: true }); }
});

// keep type import referenced
export type { CapturePayload };
