import { CaptureSummary, CapturePayload, PluginMessage } from './types';

const BACKEND_URL = 'http://localhost:3000';

const listEl    = document.getElementById('capture-list') as HTMLDivElement;
const btnLatest = document.getElementById('btn-latest')   as HTMLButtonElement;
const btnRefresh= document.getElementById('btn-refresh')  as HTMLButtonElement;
const statusEl  = document.getElementById('status')       as HTMLDivElement;

function setStatus(message: string, type: 'loading' | 'success' | 'error' | 'idle') {
  statusEl.textContent = message;
  statusEl.className   = `status ${type}`;
}

function renderList(items: CaptureSummary[]) {
  listEl.innerHTML = '';
  if (items.length === 0) {
    listEl.innerHTML = '<p class="empty">No captures yet. Use the Chrome extension to capture a page.</p>';
    return;
  }
  items.forEach((item) => {
    const card  = document.createElement('div'); card.className = 'card';
    const info  = document.createElement('div'); info.className = 'card-info';
    const title = document.createElement('span'); title.className = 'card-title';
    title.textContent = item.title || 'Untitled';
    const meta  = document.createElement('span'); meta.className = 'card-meta';
    meta.textContent = `${item.mode} · ${new Date(item.timestamp).toLocaleTimeString()}`;
    info.appendChild(title); info.appendChild(meta);
    const btn = document.createElement('button');
    btn.className = 'btn btn-import'; btn.textContent = 'Import';
    btn.addEventListener('click', () => importById(item.id));
    card.appendChild(info); card.appendChild(btn);
    listEl.appendChild(card);
  });
}

async function fetchList() {
  setStatus('Loading…', 'loading');
  try {
    const res   = await fetch(`${BACKEND_URL}/captures`);
    const items: CaptureSummary[] = await res.json();
    renderList(items);
    setStatus(items.length === 0 ? 'No captures yet.' : '', 'idle');
  } catch {
    renderList([]);
    setStatus('Backend not running. Start it with: npm run dev', 'error');
  }
}

// Decode a base64 data-URL to number[] so it survives Figma's postMessage JSON serialization
function dataUrlToNumbers(dataUrl: string): number[] | null {
  try {
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const binary = atob(base64);
    const arr    = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  } catch { return null; }
}

async function sendImport(payload: CapturePayload) {
  setStatus('Building Figma nodes…', 'loading');

  // Decode all embedded images here (browser iframe — atob available)
  // Figma JSON-serializes postMessage, so Uint8Array→number[] is required
  const imageMap: Record<string, number[]> = {};
  for (const [url, dataUrl] of Object.entries(payload.images ?? {})) {
    const nums = dataUrlToNumbers(dataUrl);
    if (nums) imageMap[url] = nums;
  }

  const { images: _, ...payloadNoImages } = payload;
  parent.postMessage({ pluginMessage: { type: 'CREATE_NODES', payload: payloadNoImages, imageMap } }, '*');
}

async function importById(id: string) {
  setStatus('Fetching capture…', 'loading');
  try {
    const res = await fetch(`${BACKEND_URL}/capture/${id}`);
    if (!res.ok) { setStatus('Capture not found.', 'error'); return; }
    await sendImport(await res.json());
  } catch { setStatus('Failed to fetch capture.', 'error'); }
}

async function importLatest() {
  setStatus('Fetching latest capture…', 'loading');
  try {
    const res = await fetch(`${BACKEND_URL}/capture/latest`);
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
      text += `  ⚠ ${msg.substitutions.length} font substitution${msg.substitutions.length===1?'':'s'}:`
        + msg.substitutions.slice(0, 5).map(s => `\n   · ${s.requested} → ${s.loaded}`).join('');
      if (msg.substitutions.length > 5) text += `\n   · +${msg.substitutions.length - 5} more`;
    }
    setStatus(text, 'success');
    fetchList();
  }
  if (msg.type === 'ERROR') { setStatus(msg.message, 'error'); }
};

btnLatest.addEventListener('click',  importLatest);
btnRefresh.addEventListener('click', fetchList);

fetchList();
