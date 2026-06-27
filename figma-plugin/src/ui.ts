import { CaptureSummary, CapturePayload, FrameImport, PluginMessage } from './types';

const BACKEND_URL = 'http://localhost:3000';

const listEl     = document.getElementById('capture-list') as HTMLDivElement;
const btnLatest  = document.getElementById('btn-latest')   as HTMLButtonElement;
const btnRefresh = document.getElementById('btn-refresh')  as HTMLButtonElement;
const statusEl   = document.getElementById('status')       as HTMLDivElement;

function setStatus(message: string, type: 'loading' | 'success' | 'error' | 'idle') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function renderList(items: CaptureSummary[]) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<p class="empty">No captures yet.<br/>Use the Chrome extension to capture a page.</p>';
    return;
  }
  for (const item of items) {
    const card  = document.createElement('div'); card.className = 'card';
    const info  = document.createElement('div'); info.className = 'card-info';
    const title = document.createElement('span'); title.className = 'card-title';
    title.textContent = item.title || 'Untitled';
    if (item.mode && item.mode.includes('multi')) {
      const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'multi'; title.appendChild(b);
    }
    const meta = document.createElement('span'); meta.className = 'card-meta';
    meta.textContent = `${item.mode || 'capture'} · ${new Date(item.timestamp).toLocaleTimeString()}`;
    info.appendChild(title); info.appendChild(meta);
    const btn = document.createElement('button');
    btn.className = 'btn btn-import'; btn.textContent = 'Import';
    btn.addEventListener('click', () => importById(item.id));
    card.appendChild(info); card.appendChild(btn);
    listEl.appendChild(card);
  }
}

// REFRESH: re-fetch the capture list from the backend and re-render — no restart.
async function fetchList() {
  setStatus('Refreshing…', 'loading');
  try {
    const res = await fetch(`${BACKEND_URL}/captures`, { cache: 'no-store' });
    const items: CaptureSummary[] = await res.json();
    renderList(items);
    setStatus(items.length ? `${items.length} capture${items.length > 1 ? 's' : ''} available.` : 'No captures yet.', 'idle');
  } catch {
    renderList([]);
    setStatus('Backend not running. Start it with: npm run dev', 'error');
  }
}

function dataUrlToNumbers(dataUrl: string): number[] | null {
  try {
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const binary = atob(base64);
    const arr = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  } catch { return null; }
}

function decodeImages(images?: Record<string, string>): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const [key, dataUrl] of Object.entries(images ?? {})) {
    const nums = dataUrlToNumbers(dataUrl);
    if (nums) map[key] = nums;
  }
  return map;
}

// Accepts either a single CapturePayload or a multi-viewport doc { frames: [...] }.
async function sendImport(doc: any) {
  setStatus('Building Figma nodes…', 'loading');

  if (Array.isArray(doc.frames)) {
    const frames: FrameImport[] = doc.frames.map((f: any) => {
      const imageMap = decodeImages(f.images);
      const { images: _omit, ...payload } = f;
      return { label: f.label, width: f.width, payload, imageMap };
    });
    parent.postMessage({ pluginMessage: { type: 'CREATE_NODES_MULTI', frames } }, '*');
    return;
  }

  const imageMap = decodeImages(doc.images);
  const { images: _omit, ...payload } = doc as CapturePayload;
  parent.postMessage({ pluginMessage: { type: 'CREATE_NODES', payload, imageMap } }, '*');
}

async function importById(id: string) {
  setStatus('Fetching capture…', 'loading');
  try {
    const res = await fetch(`${BACKEND_URL}/capture/${id}`, { cache: 'no-store' });
    if (!res.ok) { setStatus('Capture not found.', 'error'); return; }
    await sendImport(await res.json());
  } catch { setStatus('Failed to fetch capture.', 'error'); }
}

async function importLatest() {
  setStatus('Fetching latest capture…', 'loading');
  try {
    const res = await fetch(`${BACKEND_URL}/capture/latest`, { cache: 'no-store' });
    if (!res.ok) { setStatus('No captures yet. Capture a page first.', 'error'); return; }
    await sendImport(await res.json());
  } catch { setStatus('Backend not running. Start it with: npm run dev', 'error'); }
}

window.onmessage = (event) => {
  const msg: PluginMessage = event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === 'IMPORT_DONE') {
    let text = `Imported "${msg.name}" successfully!`;
    if (msg.substitutions?.length) {
      text += `  ⚠ ${msg.substitutions.length} font substitution${msg.substitutions.length === 1 ? '' : 's'}`;
    }
    setStatus(text, 'success');
    fetchList();
  }
  if (msg.type === 'ERROR') setStatus(msg.message, 'error');
};

btnLatest.addEventListener('click', importLatest);
btnRefresh.addEventListener('click', fetchList);

fetchList();
