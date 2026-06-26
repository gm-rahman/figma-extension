import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { CapturePayload } from './types';

const app = express();
const PORT = 3000;
const MAX_CAPTURES = 10;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// In-memory store — good enough for local testing
const captures = new Map<string, CapturePayload>();

// Chrome extension POSTs captured DOM data here
app.post('/capture', (req, res) => {
  const id = uuidv4();
  const payload: CapturePayload = { ...req.body, id, timestamp: Date.now() };
  captures.set(id, payload);

  // Evict oldest entry once we exceed the limit
  if (captures.size > MAX_CAPTURES) {
    const oldest = captures.keys().next().value;
    if (oldest) captures.delete(oldest);
  }

  console.log(`[capture] saved  id=${id}  title="${payload.title}"`);
  res.json({ id });
});

// Figma plugin fetches the most recent capture
app.get('/capture/latest', (_req, res) => {
  if (captures.size === 0) {
    res.status(404).json({ error: 'No captures yet' });
    return;
  }
  const all = Array.from(captures.values());
  res.json(all[all.length - 1]);
});

// Figma plugin fetches a specific capture by ID
app.get('/capture/:id', (req, res) => {
  const capture = captures.get(req.params.id);
  if (!capture) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(capture);
});

// Figma plugin lists all captures (for the selection UI)
app.get('/captures', (_req, res) => {
  const list = Array.from(captures.values()).map(({ id, title, url, timestamp, mode }) => ({
    id,
    title,
    url,
    timestamp,
    mode,
  }));
  res.json(list.reverse());
});

// Delete a capture after it has been imported
app.delete('/capture/:id', (req, res) => {
  captures.delete(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Backend running → http://localhost:${PORT}`);
});
