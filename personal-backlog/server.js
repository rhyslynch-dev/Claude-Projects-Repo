const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'backlog.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Data helpers ─────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { tasks: [], habits: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { tasks: [], habits: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ── Tasks API ─────────────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  const data = loadData();
  res.json(data.tasks);
});

app.post('/api/tasks', (req, res) => {
  const { name, section, priority, dueDate } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const data = loadData();
  const task = {
    id: Date.now(),
    name: name.trim(),
    section: section || 'today',
    priority: priority || 'A',
    dueDate: dueDate || null,
    notes: req.body.notes || null,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  data.tasks.push(task);
  saveData(data);
  res.json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const data = loadData();
  const task = data.tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) return res.status(404).json({ error: 'Not found' });
  const { name, section, priority, dueDate, notes, completedAt } = req.body;
  if (name !== undefined) task.name = name;
  if (section !== undefined) task.section = section;
  if (priority !== undefined) task.priority = priority;
  if (dueDate !== undefined) task.dueDate = dueDate;
  if (notes !== undefined) task.notes = notes;
  if (completedAt !== undefined) task.completedAt = completedAt;
  saveData(data);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const data = loadData();
  data.tasks = data.tasks.filter(t => t.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ ok: true });
});

// ── Habits API ────────────────────────────────────────────────────────────────

app.get('/api/habits', (req, res) => {
  const data = loadData();
  res.json(data.habits);
});

app.post('/api/habits', (req, res) => {
  const { name, emoji } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const data = loadData();
  const habit = {
    id: Date.now(),
    name: name.trim(),
    emoji: emoji || '✅',
    streak: 0,
    bestStreak: 0,
    completedDates: [],
    createdAt: new Date().toISOString(),
  };
  data.habits.push(habit);
  saveData(data);
  res.json(habit);
});

app.patch('/api/habits/:id/toggle', (req, res) => {
  const data = loadData();
  const habit = data.habits.find(h => h.id === parseInt(req.params.id));
  if (!habit) return res.status(404).json({ error: 'Not found' });

  const today = todayStr();
  const idx = habit.completedDates.indexOf(today);

  if (idx === -1) {
    habit.completedDates.push(today);
  } else {
    habit.completedDates.splice(idx, 1);
  }

  // Recalculate streak
  const dates = [...habit.completedDates].sort();
  let streak = 0;
  let check = today;
  while (dates.includes(check)) {
    streak++;
    const d = new Date(check);
    d.setDate(d.getDate() - 1);
    check = d.toISOString().split('T')[0];
  }
  habit.streak = streak;
  habit.bestStreak = Math.max(habit.bestStreak, streak);

  saveData(data);
  res.json(habit);
});

app.delete('/api/habits/:id', (req, res) => {
  const data = loadData();
  data.habits = data.habits.filter(h => h.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Personal Backlog running at http://localhost:${PORT}`);
});
