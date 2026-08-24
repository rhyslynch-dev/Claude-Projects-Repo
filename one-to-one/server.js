const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const DATA_FILE = path.join(__dirname, 'data', 'one-to-one.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MEMBERS = [
  { id: 'david',     name: 'David',    photo: '/images/David.png' },
  { id: 'rowena',    name: 'Rowena',   photo: '/images/Row.png' },
  { id: 'nathaniel', name: 'Nathaniel', photo: '/images/Nate.png' },
  { id: 'arslan',    name: 'Arslan',   photo: '/images/Arslan.jpg' },
  { id: 'megan',     name: 'Megan',    photo: '/images/Megan.jpg' },
  { id: 'sumit',     name: 'Sumit',    photo: '/images/Sumit-Ingle.jpg' },
];

// ── Data helpers ──────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return initData();
  let data;
  try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return initData(); }
  return backfillBoards(data);
}

function initData() {
  return backfillBoards({ boards: {} });
}

// Members added to MEMBERS after the data file was first written have no board,
// so every request for them 404s and their board is unusable. Create any that
// are missing rather than relying on first-run initialisation.
function backfillBoards(data) {
  if (!data.boards) data.boards = {};
  for (const m of MEMBERS) {
    if (!data.boards[m.id]) {
      data.boards[m.id] = { topics: [], priorities: [], bhags: [] };
    }
  }
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Members ───────────────────────────────────────────────────────────────────

app.get('/api/members', (req, res) => res.json(MEMBERS));

// ── Topics ────────────────────────────────────────────────────────────────────

app.get('/api/boards/:memberId/topics', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  res.json(board.topics);
});

app.post('/api/boards/:memberId/topics', (req, res) => {
  const { text, description, addedBy } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  const topic = {
    id: Date.now(),
    text: text.trim(),
    description: description?.trim() || null,
    addedBy: addedBy || 'rhys',
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  board.topics.push(topic);
  saveData(data);
  res.json(topic);
});

app.patch('/api/boards/:memberId/topics/:id', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  const topic = board.topics.find(t => t.id === parseInt(req.params.id));
  if (!topic) return res.status(404).json({ error: 'Not found' });
  const { text, description, completedAt } = req.body;
  if (text !== undefined) topic.text = text;
  if (description !== undefined) topic.description = description;
  if (completedAt !== undefined) topic.completedAt = completedAt;
  saveData(data);
  res.json(topic);
});

app.delete('/api/boards/:memberId/topics/:id', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  board.topics = board.topics.filter(t => t.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ ok: true });
});

// ── Priorities & Blockers ─────────────────────────────────────────────────────

app.get('/api/boards/:memberId/priorities', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  res.json(board.priorities || []);
});

app.post('/api/boards/:memberId/priorities', (req, res) => {
  const { text, description, type } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  if (!board.priorities) board.priorities = [];
  const item = {
    id: Date.now(),
    text: text.trim(),
    description: description?.trim() || null,
    type: type === 'blocker' ? 'blocker' : 'priority',
    resolvedAt: null,
    createdAt: new Date().toISOString(),
  };
  board.priorities.push(item);
  saveData(data);
  res.json(item);
});

app.patch('/api/boards/:memberId/priorities/:id', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  const item = (board.priorities || []).find(p => p.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { text, description, resolvedAt } = req.body;
  if (text !== undefined) item.text = text;
  if (description !== undefined) item.description = description;
  if (resolvedAt !== undefined) item.resolvedAt = resolvedAt;
  saveData(data);
  res.json(item);
});

app.delete('/api/boards/:memberId/priorities/:id', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  board.priorities = (board.priorities || []).filter(p => p.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ ok: true });
});

// ── BHAGs ─────────────────────────────────────────────────────────────────────

app.get('/api/boards/:memberId/bhags', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  res.json(board.bhags);
});

app.post('/api/boards/:memberId/bhags', (req, res) => {
  const { title, description, emoji } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  const bhag = {
    id: Date.now(),
    title: title.trim(),
    description: description || null,
    emoji: emoji || '🎯',
    achieved: false,
    createdAt: new Date().toISOString(),
  };
  board.bhags.push(bhag);
  saveData(data);
  res.json(bhag);
});

app.patch('/api/boards/:memberId/bhags/:id', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  const bhag = board.bhags.find(b => b.id === parseInt(req.params.id));
  if (!bhag) return res.status(404).json({ error: 'Not found' });
  const { title, description, emoji, achieved } = req.body;
  if (title !== undefined) bhag.title = title;
  if (description !== undefined) bhag.description = description;
  if (emoji !== undefined) bhag.emoji = emoji;
  if (achieved !== undefined) bhag.achieved = achieved;
  saveData(data);
  res.json(bhag);
});

app.delete('/api/boards/:memberId/bhags/:id', (req, res) => {
  const data = loadData();
  const board = data.boards[req.params.memberId];
  if (!board) return res.status(404).json({ error: 'Member not found' });
  board.bhags = board.bhags.filter(b => b.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`1:1s running at http://localhost:${PORT}`);
});
