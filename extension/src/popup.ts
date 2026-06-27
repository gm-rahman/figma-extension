import { MessageFromContent, ViewportSpec } from './types';

const BACKEND_URL = 'http://localhost:3000';

const DEVICES: ViewportSpec[] = [
  { label: 'Desktop', width: 1440, height: 900 },
  { label: 'Laptop',  width: 1024, height: 768 },
  { label: 'Tablet',  width: 768,  height: 1024 },
  { label: 'Mobile',  width: 402,  height: 874 },
];

const devicesEl = document.getElementById('devices') as HTMLDivElement;
const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnSelect  = document.getElementById('btn-select-element') as HTMLButtonElement;
const statusEl   = document.getElementById('status') as HTMLDivElement;

const TICK = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Render device rows; Desktop selected by default.
const selected = new Set<string>(['Desktop']);
for (const d of DEVICES) {
  const row = document.createElement('label');
  row.className = 'device' + (selected.has(d.label) ? ' checked' : '');
  row.innerHTML =
    `<span class="tick">${TICK}</span><span class="name">${d.label}</span><span class="w">${d.width}px</span>`;
  row.addEventListener('click', (e) => {
    e.preventDefault();
    if (selected.has(d.label)) selected.delete(d.label); else selected.add(d.label);
    row.classList.toggle('checked', selected.has(d.label));
  });
  devicesEl.appendChild(row);
}

let captureTimeout: ReturnType<typeof setTimeout> | null = null;
function setStatus(message: string, type: 'loading' | 'success' | 'error') {
  statusEl.textContent = message; statusEl.className = `status ${type}`;
}
function setLoading(loading: boolean) { btnCapture.disabled = loading; btnSelect.disabled = loading; }
function startTimeout() {
  if (captureTimeout) clearTimeout(captureTimeout);
  captureTimeout = setTimeout(() => { setLoading(false); setStatus('Timed out. Try again.', 'error'); }, 90_000);
}
function clearTimeoutNow() { if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; } }

async function checkBackend(): Promise<boolean> {
  try { await fetch(`${BACKEND_URL}/captures`); return true; } catch { return false; }
}
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}
function isRestricted(url?: string): boolean {
  if (!url) return true;
  return ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:'].some(p => url.startsWith(p));
}
async function ensureContent(tabId: number): Promise<void> {
  try { await chrome.tabs.sendMessage(tabId, { type: 'PING' }); }
  catch {
    try { await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/content.js'] }); await new Promise(r => setTimeout(r, 60)); } catch { /* ignore */ }
  }
}

chrome.runtime.onMessage.addListener((msg: MessageFromContent) => {
  if (msg.type === 'CAPTURE_PROGRESS') { setStatus(msg.message, 'loading'); startTimeout(); return; }
  if (msg.type === 'CAPTURE_DONE')     { clearTimeoutNow(); setLoading(false); setStatus('Captured! Open the Figma plugin to import.', 'success'); return; }
  if (msg.type === 'CAPTURE_ERROR')    { clearTimeoutNow(); setLoading(false); setStatus(msg.message ?? 'Something went wrong.', 'error'); }
});

btnCapture.addEventListener('click', async () => {
  const viewports = DEVICES.filter(d => selected.has(d.label));
  if (!viewports.length) { setStatus('Select at least one viewport.', 'error'); return; }

  setLoading(true);
  setStatus('Checking backend…', 'loading');
  if (!(await checkBackend())) { setLoading(false); setStatus('Backend not running. Run: cd backend && npm run dev', 'error'); return; }

  const tab = await getActiveTab();
  if (!tab?.id) { setLoading(false); return; }
  if (isRestricted(tab.url)) { setLoading(false); setStatus('Cannot capture browser system pages.', 'error'); return; }

  await ensureContent(tab.id);
  setStatus(`Capturing ${viewports.length} viewport${viewports.length > 1 ? 's' : ''}…`, 'loading');
  startTimeout();

  chrome.runtime.sendMessage({ type: 'CAPTURE_MULTI', viewports }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      clearTimeoutNow(); setLoading(false);
      setStatus(res?.message ?? chrome.runtime.lastError?.message ?? 'Capture failed.', 'error');
    }
  });
});

btnSelect.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await ensureContent(tab.id);
  try { await chrome.tabs.sendMessage(tab.id, { type: 'START_ELEMENT_PICKER' }); window.close(); }
  catch { setStatus('Could not reach the page. Refresh and retry.', 'error'); }
});

// Restore a result if the popup was reopened after an element-picker capture.
(async () => {
  const r = await chrome.storage.local.get('lastCapture');
  if (r.lastCapture?.status === 'done' && Date.now() - r.lastCapture.timestamp < 30_000) {
    setStatus('Captured! Open the Figma plugin to import.', 'success');
    await chrome.storage.local.remove('lastCapture');
  }
})();
