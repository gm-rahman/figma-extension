const BACKEND_URL = 'http://localhost:3000';

const btnFullPage = document.getElementById('btn-full-page') as HTMLButtonElement;
const btnSelectEl  = document.getElementById('btn-select-element') as HTMLButtonElement;
const statusEl     = document.getElementById('status') as HTMLDivElement;

let captureTimeout: ReturnType<typeof setTimeout> | null = null;

function setStatus(message: string, type: 'loading' | 'success' | 'error') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function clearStatus() {
  statusEl.className = 'status';
  statusEl.textContent = '';
}

function setLoading(loading: boolean) {
  btnFullPage.disabled = loading;
  btnSelectEl.disabled  = loading;
}

function startCaptureTimeout() {
  if (captureTimeout) clearTimeout(captureTimeout);
  captureTimeout = setTimeout(() => {
    setLoading(false);
    setStatus('Timed out. Refresh the page and try again.', 'error');
  }, 15_000);
}

function clearCaptureTimeout() {
  if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
}

async function checkBackend(): Promise<boolean> {
  try { await fetch(`${BACKEND_URL}/captures`); return true; }
  catch { return false; }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  return url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('data:');
}

async function sendToTab(tabId: number, msg: object): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch {
    // Content script not yet injected — inject it now (works on http/https/localhost/file://)
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/content.js'] });
      await new Promise(r => setTimeout(r, 50)); // allow script to initialize
      await chrome.tabs.sendMessage(tabId, msg);
      return true;
    } catch {
      return false;
    }
  }
}

// Listen for results from the content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CAPTURE_DONE') {
    clearCaptureTimeout();
    setLoading(false);
    setStatus('Captured! Open the Figma plugin to import.', 'success');
  }
  if (msg.type === 'CAPTURE_ERROR') {
    clearCaptureTimeout();
    setLoading(false);
    setStatus(msg.message ?? 'Something went wrong.', 'error');
  }
});

btnFullPage.addEventListener('click', async () => {
  clearStatus();
  setLoading(true);
  setStatus('Checking backend…', 'loading');

  const alive = await checkBackend();
  if (!alive) {
    setLoading(false);
    setStatus('Backend not running. Run: cd backend && npm run dev', 'error');
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) { setLoading(false); return; }

  if (isRestrictedUrl(tab.url)) {
    setLoading(false);
    setStatus('Cannot capture browser system pages. Navigate to a website first.', 'error');
    return;
  }

  setStatus('Capturing page…', 'loading');
  startCaptureTimeout();

  const ok = await sendToTab(tab.id, { type: 'CAPTURE_FULL_PAGE' });
  if (!ok) {
    clearCaptureTimeout();
    setLoading(false);
    setStatus('Could not inject into page. For local files, enable "Allow access to file URLs" in extension settings.', 'error');
  }
});

btnSelectEl.addEventListener('click', async () => {
  clearStatus();
  setLoading(true);
  setStatus('Checking backend…', 'loading');

  const alive = await checkBackend();
  if (!alive) {
    setLoading(false);
    setStatus('Backend not running. Run: cd backend && npm run dev', 'error');
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) { setLoading(false); return; }

  const ok = await sendToTab(tab.id, { type: 'START_ELEMENT_PICKER' });
  if (!ok) {
    setLoading(false);
    setStatus('Could not reach the page. Refresh the page and try again.', 'error');
    return;
  }

  window.close();
});

// Check for a pending result from the element picker (popup was closed during capture)
async function checkStoredResult() {
  const result = await chrome.storage.local.get('lastCapture');
  if (result.lastCapture?.status === 'done') {
    const age = Date.now() - result.lastCapture.timestamp;
    if (age < 30_000) {
      setStatus('Captured! Open the Figma plugin to import.', 'success');
    }
    await chrome.storage.local.remove('lastCapture');
  }
}

checkStoredResult();
