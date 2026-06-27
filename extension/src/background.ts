const BACKEND_URL = 'http://localhost:3000';
const MAX_IMAGES  = 40;
const MAX_IMG_BYTES = 2_000_000; // 2 MB per image

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

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMG_BYTES) return null;

    const bytes = new Uint8Array(buf);
    let binary  = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK)
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));

    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return `data:${mimeType.split(';')[0]};base64,${btoa(binary)}`;
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
  const urls   = collectImageUrls(payload.nodes ?? []);
  // Preserve any images already on the payload (e.g. rasterized element PNGs).
  const images: Record<string, string> = { ...(payload.images ?? {}) };
  let   count  = 0;
  const base   = payload.url as string | undefined;

  for (const url of urls) {
    if (count >= MAX_IMAGES) break;
    const resolved = resolveUrl(url, base);
    if (!resolved) continue;
    // Pass data URLs through directly — no fetch needed.
    if (resolved.startsWith('data:')) {
      images[url] = resolved; count++; continue;
    }
    const dataUrl = await fetchImageAsDataUrl(resolved);
    if (dataUrl) { images[url] = dataUrl; count++; }
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

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

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
