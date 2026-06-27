const BACKEND_URL = 'http://localhost:3000';
const MAX_IMAGES        = 1000;
const MAX_IMG_BYTES     = 12_000_000;   // 12 MB per source image (raised from 2 MB)
const MAX_TOTAL_BYTES   = 42_000_000;   // keep the whole payload under the backend's 50 MB JSON limit
const FETCH_CONCURRENCY = 8;            // fetch images in parallel batches (was sequential)
const MAX_IMAGE_DIM     = 4096;         // figma.createImage hard limit — downscale rasters above this

chrome.runtime.onInstalled.addListener(() => {
  console.log('HTML to Figma extension installed.');
});

// ── Image fetching ─────────────────────────────────────────────────────────

function collectImageUrls(nodes: any[]): Set<string> {
  const urls = new Set<string>();
  function walk(node: any) {
    if (node.type === 'image' && node.src)               urls.add(node.src);
    if (node.style?.backgroundImageUrl)                  urls.add(node.style.backgroundImageUrl);
    for (const child of node.children ?? []) walk(child);
  }
  for (const n of nodes) walk(n);
  return urls;
}

function isSvgSource(url: string, contentType: string): boolean {
  return contentType === 'image/svg+xml' || /\.svg(\?|#|$)/i.test(url);
}

// Decode a raster, and if it exceeds Figma's 4096px limit (createImage throws
// above it), downscale to fit. Small files skip the decode cost. SVGs never reach
// here. Returns base64-encoded bytes + a mime type.
async function normalizeRaster(buf: ArrayBuffer, mime: string): Promise<{ b64: string; mime: string }> {
  const bytes = new Uint8Array(buf);
  // Only pay the decode cost for files big enough to plausibly exceed 4096px.
  if (buf.byteLength < 400_000 || typeof createImageBitmap === 'undefined') {
    return { b64: bytesToBase64(bytes), mime };
  }
  try {
    const bmp = await createImageBitmap(new Blob([buf], { type: mime }));
    if (bmp.width <= MAX_IMAGE_DIM && bmp.height <= MAX_IMAGE_DIM) {
      bmp.close();
      return { b64: bytesToBase64(bytes), mime };
    }
    const scale  = MAX_IMAGE_DIM / Math.max(bmp.width, bmp.height);
    const w      = Math.max(1, Math.round(bmp.width  * scale));
    const h      = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const outBlob  = await canvas.convertToBlob({ type: 'image/png' });
    const outBytes = new Uint8Array(await outBlob.arrayBuffer());
    return { b64: bytesToBase64(outBytes), mime: 'image/png' };
  } catch {
    return { b64: bytesToBase64(bytes), mime };
  }
}

// Fetch one image URL → a data URL (or null). SVG sources are kept as raw SVG
// markup (data:image/svg+xml) so the plugin can render them as native vectors —
// figma.createImage can't decode SVG. Returns the byte size for budget tracking.
async function fetchOneImage(url: string, base: string | undefined):
    Promise<{ key: string; dataUrl: string; bytes: number } | null> {
  const resolved = resolveUrl(url, base);
  if (!resolved) return null;
  if (resolved.startsWith('data:')) return { key: url, dataUrl: resolved, bytes: resolved.length };
  try {
    const res = await fetch(resolved, { cache: 'force-cache' });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMG_BYTES) return null;

    if (isSvgSource(resolved, contentType)) {
      const dataUrl = `data:image/svg+xml;base64,${bytesToBase64(new Uint8Array(buf))}`;
      return { key: url, dataUrl, bytes: dataUrl.length };
    }
    const { b64, mime } = await normalizeRaster(buf, contentType || 'image/jpeg');
    const dataUrl = `data:${mime};base64,${b64}`;
    return { key: url, dataUrl, bytes: dataUrl.length };
  } catch {
    return null;
  }
}

// Resolve a possibly-relative URL against the page URL captured in the payload.
function resolveUrl(url: string, base: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url; // already inline
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  if (!base) return null; // can't resolve relative URL without a base
  try { return new URL(url, base).href; }
  catch { return null; }
}

async function embedImages(payload: any): Promise<any> {
  const urls   = [...collectImageUrls(payload.nodes ?? [])];
  // Preserve any images already on the payload (e.g. rasterized element PNGs).
  const images: Record<string, string> = { ...(payload.images ?? {}) };
  const base   = payload.url as string | undefined;

  // Budget against the existing payload (rasterized PNGs already present).
  let totalBytes = Object.values(images).reduce((n, v) => n + v.length, 0);
  let count      = Object.keys(images).length;

  // Fetch in parallel batches (was strictly sequential — far too slow at 1000).
  for (let i = 0; i < urls.length && count < MAX_IMAGES; i += FETCH_CONCURRENCY) {
    const batch   = urls.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((u) => fetchOneImage(u, base)));
    for (const r of results) {
      if (!r || images[r.key]) continue;
      if (count >= MAX_IMAGES) break;
      // Stay under the backend's JSON size limit — skip rather than fail the POST.
      if (totalBytes + r.bytes > MAX_TOTAL_BYTES) continue;
      images[r.key] = r.dataUrl;
      totalBytes   += r.bytes;
      count++;
    }
  }

  return { ...payload, images };
}

// ── Google Sheets CSV ──────────────────────────────────────────────────────

async function fetchSheetCsv(spreadsheetId: string, gid: string): Promise<string> {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
  ];
  let lastError = 'Failed to fetch sheet CSV';
  for (const url of urls) {
    try {
      const res  = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
      const text = await res.text();
      if (text.includes('<!DOCTYPE html')) { lastError = 'Got HTML instead of CSV'; continue; }
      return text;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'fetch failed';
    }
  }
  throw new Error(lastError);
}

// ── Element rasterization (screenshot + crop) ────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

// Crop a full-viewport PNG data-URL to the element's rect (CSS px × devicePixelRatio).
async function cropDataUrl(dataUrl: string, rect: { x: number; y: number; width: number; height: number }, dpr: number): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp  = await createImageBitmap(blob);

  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(bmp.width  - sx, Math.round(rect.width  * dpr));
  const sh = Math.min(bmp.height - sy, Math.round(rect.height * dpr));

  const outW = Math.max(1, Math.round(rect.width));
  const outH = Math.max(1, Math.round(rect.height));
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, outW, outH);
  bmp.close();

  const outBlob = await canvas.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await outBlob.arrayBuffer());
  return `data:image/png;base64,${bytesToBase64(buf)}`;
}

async function captureElement(tab: chrome.tabs.Tab, rect: any, dpr: number): Promise<string> {
  const full = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' });
  return cropDataUrl(full, rect, dpr);
}

// ── Multi-viewport capture (via chrome.debugger device emulation) ─────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function dbgSend(tabId: number, method: string, params: object): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (r) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve(r);
    });
  });
}
function dbgAttach(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve();
    });
  });
}
function dbgDetach(tabId: number): Promise<void> {
  return new Promise((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
}

function progress(message: string) {
  chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', phase: 'preparing', message }).catch(() => {});
}

// Emulate each selected width, ask the content script to build a payload for that
// layout, embed its images, and POST one combined multi-frame capture.
async function captureMulti(tabId: number, windowId: number, viewports: Array<{ label: string; width: number; height: number }>) {
  await dbgAttach(tabId);
  const frames: any[] = [];
  try {
    for (const vp of viewports) {
      progress(`Emulating ${vp.label} (${vp.width}px)…`);
      await dbgSend(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width <= 768,
        screenWidth: vp.width, screenHeight: vp.height,
      });
      await sleep(450); // let the responsive layout settle

      const resp: any = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_VIEWPORT', label: vp.label, width: vp.width });
      if (!resp?.ok || !resp.payload) continue;

      progress(`Fetching images for ${vp.label}…`);
      const enriched = await embedImages(resp.payload);
      frames.push({ label: vp.label, width: vp.width, ...enriched });
    }
  } finally {
    try { await dbgSend(tabId, 'Emulation.clearDeviceMetricsOverride', {}); } catch { /* ignore */ }
    await dbgDetach(tabId);
  }
  if (!frames.length) throw new Error('No viewports captured');

  const doc = {
    title: frames[0].title, url: frames[0].url, mode: 'multi-viewport', frames,
  };
  const res = await fetch(`${BACKEND_URL}/capture`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  return (await res.json()).id as string;
}

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'CAPTURE_MULTI') {
    (async () => {
      try {
        const tab = sender.tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab?.id) throw new Error('no tab');
        const id = await captureMulti(tab.id, tab.windowId!, msg.viewports);
        await chrome.storage.local.set({ lastCapture: { id, status: 'done', timestamp: Date.now() } });
        chrome.runtime.sendMessage({ type: 'CAPTURE_DONE', id }).catch(() => {});
        sendResponse({ ok: true, id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Multi-capture failed';
        chrome.runtime.sendMessage({ type: 'CAPTURE_ERROR', message }).catch(() => {});
        sendResponse({ ok: false, message });
      }
    })();
    return true;
  }

  if (msg.type === 'CAPTURE_ELEMENT') {
    (async () => {
      try {
        if (!sender.tab) throw new Error('no tab');
        const dataUrl = await captureElement(sender.tab, msg.rect, msg.dpr || 1);
        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        sendResponse({ ok: false, message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // async
  }

  if (msg.type === 'SAVE_CAPTURE') {
    (async () => {
      try {
        const enriched = await embedImages(msg.payload);
        const res = await fetch(`${BACKEND_URL}/capture`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(enriched),
        });
        if (!res.ok) throw new Error(`Backend ${res.status}`);
        const { id } = await res.json();

        await chrome.storage.local.set({ lastCapture: { id, status: 'done', timestamp: Date.now() } });
        chrome.runtime.sendMessage({ type: 'CAPTURE_DONE', id }).catch(() => {});
        sendResponse({ ok: true, id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Save failed';
        chrome.runtime.sendMessage({ type: 'CAPTURE_ERROR', message }).catch(() => {});
        sendResponse({ ok: false, message });
      }
    })();
    return true; // keep channel open for async
  }

  if (msg.type === 'FETCH_SHEET_CSV') {
    fetchSheetCsv(msg.spreadsheetId, msg.gid)
      .then(csv  => sendResponse({ ok: true, csv }))
      .catch(err => sendResponse({ ok: false, message: err instanceof Error ? err.message : String(err) }));
    return true;
  }
});
