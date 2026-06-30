import { CapturePayload, CapturePhase, CaptureProgressMessage, MessageToContent } from './types';
import { buildPayload, getRasterTargets } from './capture-core';
import { isGoogleSheet, sheetIdAndGid, parseCsv, buildSheetPayload } from './sheet-table';

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

// Strictly-typed progress emitter (content → popup). Fire-and-forget; sent
// synchronously at each phase boundary so the popup updates immediately and is
// never blocked by the async capture work that follows.
function progress(phase: CapturePhase, message: string, current?: number, total?: number) {
  const msg: CaptureProgressMessage = { type: 'CAPTURE_PROGRESS', phase, message, current, total };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// Google Sheets/Docs are canvas-rendered (no DOM text). For Sheets we instead
// fetch the sheet as CSV and build a real Figma table. Returns null when the page
// isn't a Sheet or the CSV can't be fetched (private sheet → falls back to normal
// capture, i.e. a screenshot of the canvas).
async function trySheetCapture(): Promise<CapturePayload | null> {
  if (!isGoogleSheet()) return null;
  const ids = sheetIdAndGid(location.href);
  if (!ids) return null;
  progress('reading', 'Fetching Google Sheet data…');
  try {
    const resp: any = await chrome.runtime.sendMessage({
      type: 'FETCH_SHEET_CSV', spreadsheetId: ids.id, gid: ids.gid,
    });
    if (!resp?.ok || !resp.csv) return null;
    const rows = parseCsv(resp.csv);
    if (!rows.length) return null;
    return buildSheetPayload(rows, location.href, document.title);
  } catch { return null; }
}

async function captureAndSend(mode: 'full-page') {
  const savedX = window.scrollX;
  const savedY = window.scrollY;

  // Google Sheet → data-as-table (no DOM to capture from the canvas grid).
  const sheet = await trySheetCapture();
  if (sheet) {
    progress('saving', 'Saving sheet…');
    chrome.runtime.sendMessage({ type: 'SAVE_CAPTURE', payload: sheet }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_ERROR',
          message: res?.message ?? 'Failed to save sheet',
        }).catch(() => {});
      }
    });
    return;
  }

  // Prime the page so a full-page capture matches what the user sees after
  // scrolling: trigger lazy-loaded images, below-the-fold sections, and
  // scroll-reveal animations. Mirrors test/run-capture.mjs so live captures and
  // the offline harness agree. Returns elements we force-revealed, to restore.
  progress('preparing', 'Preparing page (loading images & sections)…');
  const revealed = await prepareDomForCapture();

  // Scroll to top so getBoundingClientRect + scrollY = document coords
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 80)); // wait for layout to settle

  progress('reading', 'Reading layout…');
  const payload = buildPayload(document.body, mode);

  // Rasterize Figma-impossible elements: scroll each into view and ask the
  // background worker to screenshot + crop it (content scripts can't call
  // captureVisibleTab). Real browser pixels — guarantees fidelity.
  const rasterImages = await rasterizeFlaggedElements();
  if (Object.keys(rasterImages).length) {
    payload.images = { ...(payload.images ?? {}), ...rasterImages };
  }
  cleanupRasterTags();

  // Undo our DOM side-effects: restore scroll and remove forced opacity overrides
  // (the page's own reveal observers keep anything that legitimately became visible).
  for (const el of revealed) el.style.removeProperty('opacity');
  window.scrollTo(savedX, savedY); // restore

  progress('saving', 'Saving capture…');
  chrome.runtime.sendMessage({ type: 'SAVE_CAPTURE', payload }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_ERROR',
        message: res?.message ?? 'Failed to save capture',
      }).catch(() => {});
    }
  });
}

// Trigger lazy-loaded images, below-the-fold sections, and scroll-reveal
// animations so a full-page capture is complete. Returns the elements whose
// opacity we force-revealed, so the caller can undo the override afterwards.
async function prepareDomForCapture(): Promise<HTMLElement[]> {
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  // 1) Step down the whole page so lazy content renders + reveal observers fire.
  const step = Math.round(window.innerHeight * 0.8) || 600;
  const maxY = document.documentElement.scrollHeight;
  for (let y = 0; y < maxY; y += step) {
    window.scrollTo(0, y);
    await sleep(120);
  }
  window.scrollTo(0, 0);
  await sleep(150);

  // 2) Force-reveal scroll-reveal elements the fast scroll may have skipped:
  // fade-in-on-view widgets sit at opacity:0 until an IntersectionObserver adds a
  // class, and a quick programmatic scroll can miss the observer threshold —
  // leaving product imagery invisible (and dropped by the capture).
  const revealed: HTMLElement[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) === 0 && /opacity|all/.test(cs.transitionProperty)) {
      el.style.setProperty('opacity', '1', 'important');
      revealed.push(el);
    }
  }

  // 3) Let web fonts + freshly-triggered images settle before measuring.
  try { await (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready; } catch { /* ignore */ }
  const pending = Array.from(document.images).filter(i => !i.complete);
  await Promise.all(pending.map(img => new Promise<void>(res => {
    img.addEventListener('load',  () => res(), { once: true });
    img.addEventListener('error', () => res(), { once: true });
    setTimeout(() => res(), 3000);
  })));
  await sleep(150);

  return revealed;
}

// Screenshot every element flagged for rasterization, via the background worker.
async function rasterizeFlaggedElements(): Promise<Record<string, string>> {
  const targets = getRasterTargets();
  const images: Record<string, string> = {};
  if (!targets.length) return images;

  const dpr = window.devicePixelRatio || 1;
  let done = 0;
  for (const t of targets) {
    done++;
    progress('rasterizing', `Capturing effects ${done}/${targets.length}…`, done, targets.length);
    const el = document.querySelector(`[data-h2f-rid="${t.id}"]`) as HTMLElement | null;
    if (!el) continue;

    el.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 60)));

    const r = el.getBoundingClientRect();
    // Must be fully inside the viewport to capture in one shot.
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) continue;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'CAPTURE_ELEMENT',
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
        dpr,
      });
      if (resp?.ok && resp.dataUrl) images[t.id] = resp.dataUrl;
    } catch { /* skip this one */ }

    // Respect Chrome's captureVisibleTab rate limit (~2/sec).
    await new Promise<void>(r => setTimeout(r, 550));
  }
  return images;
}

function cleanupRasterTags(): void {
  document.querySelectorAll('[data-h2f-rid]').forEach(el => el.removeAttribute('data-h2f-rid'));
}

// ── Message listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: MessageToContent | { type: 'PING' }, _sender, sendResponse) => {
  if (msg.type === 'PING') { sendResponse({ ok: true }); return; }
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

  // Multi-viewport: the background worker has already emulated the target width
  // (via chrome.debugger). Build a payload for the CURRENT (emulated) layout and
  // return it; the worker fetches images + combines frames. Rasterization is
  // skipped here to avoid nested messaging during emulation.
  if (msg.type === 'CAPTURE_VIEWPORT') {
    (async () => {
      try {
        // Google Sheet → same data table for every viewport (dedup collapses them).
        const sheet = await trySheetCapture();
        if (sheet) { sendResponse({ ok: true, payload: sheet }); return; }

        const savedX = window.scrollX, savedY = window.scrollY;
        progress('preparing', `Capturing ${msg.label} (${msg.width}px)…`);
        // Nudge JS-driven responsive components (resize listeners) — device-metrics
        // emulation re-evaluates CSS media queries but does NOT fire a resize event.
        window.dispatchEvent(new Event('resize'));
        await new Promise(r => setTimeout(r, 150));
        const revealed = await prepareDomForCapture();
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 80));
        const payload = buildPayload(document.body, 'full-page');
        // Record the ACTUAL emulated layout width so the frame matches reality and
        // the background can detect when emulation didn't take effect.
        payload.viewport = {
          width: window.innerWidth,
          height: document.documentElement.scrollHeight,
        };
        // Rasterize this viewport's Figma-impossible elements (video, clip-path,
        // conic, etc.) too — the emulated viewport is what captureVisibleTab grabs.
        const rasterImages = await rasterizeFlaggedElements();
        if (Object.keys(rasterImages).length) {
          payload.images = { ...(payload.images ?? {}), ...rasterImages };
        }
        cleanupRasterTags();
        for (const el of revealed) el.style.removeProperty('opacity');
        window.scrollTo(savedX, savedY);
        sendResponse({ ok: true, payload });
      } catch (err) {
        sendResponse({ ok: false, message: err instanceof Error ? err.message : 'capture failed' });
      }
    })();
    return true; // async
  }
});

// keep type import referenced
export type { CapturePayload };
