const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env
if (fs.existsSync(path.join(__dirname, '.env'))) {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
}

const HIBOB_SERVICE_ID = process.env.HIBOB_SERVICE_ID;
const HIBOB_TOKEN = process.env.HIBOB_TOKEN;
const HIBOB_AUTH = Buffer.from(`${HIBOB_SERVICE_ID}:${HIBOB_TOKEN}`).toString('base64');
const MY_EMAIL = 'rhys.lynch@bulk.com';

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
  const data2 = loadData();
  const sectionTasks = data2.tasks.filter(t => t.section === (section || 'today'));
  const bTasks = sectionTasks.filter(t => t.priority === 'B');
  const aTasks = sectionTasks.filter(t => t.priority === 'A');
  // A tasks go after existing A's, B tasks go after everything
  const newOrder = (priority === 'B')
    ? (sectionTasks.length ? Math.max(...sectionTasks.map(t => t.order || 0)) + 1 : 0)
    : (aTasks.length ? Math.max(...aTasks.map(t => t.order || 0)) + 1 : (bTasks.length ? Math.min(...bTasks.map(t => t.order || 0)) - 1 : 0));

  const task = {
    id: Date.now(),
    name: name.trim(),
    section: section || 'today',
    priority: priority || 'A',
    dueDate: dueDate || null,
    notes: req.body.notes || null,
    order: newOrder,
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

app.post('/api/tasks/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid' });
  const data = loadData();
  orderedIds.forEach((id, index) => {
    const task = data.tasks.find(t => t.id === parseInt(id));
    if (task) task.order = index;
  });
  saveData(data);
  res.json({ ok: true });
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
    weekdaysOnly: req.body.weekdaysOnly || false,
    streak: 0,
    bestStreak: 0,
    completedDates: [],
    createdAt: new Date().toISOString(),
  };
  data.habits.push(habit);
  saveData(data);
  res.json(habit);
});

app.patch('/api/habits/:id', (req, res) => {
  const data = loadData();
  const habit = data.habits.find(h => h.id === parseInt(req.params.id));
  if (!habit) return res.status(404).json({ error: 'Not found' });
  const { name, emoji, weekdaysOnly } = req.body;
  if (name !== undefined) habit.name = name;
  if (emoji !== undefined) habit.emoji = emoji;
  if (weekdaysOnly !== undefined) habit.weekdaysOnly = weekdaysOnly;
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
  const dates = new Set(habit.completedDates);
  const weekdaysOnly = habit.weekdaysOnly || false;
  let streak = 0;
  let check = new Date(today + 'T00:00:00');

  while (true) {
    const dayOfWeek = check.getDay();
    // Skip weekends if weekdays only
    if (weekdaysOnly && (dayOfWeek === 0 || dayOfWeek === 6)) {
      check.setDate(check.getDate() - 1);
      continue;
    }
    const checkStr = check.toISOString().split('T')[0];
    if (!dates.has(checkStr)) break;
    streak++;
    check.setDate(check.getDate() - 1);
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

// ── HiBob Leave ──────────────────────────────────────────────────────────────

function hibobRequest(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': `Basic ${HIBOB_AUTH}`, 'Accept': 'application/json' },
      rejectUnauthorized: false,
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { from: monday.toISOString().split('T')[0], to: friday.toISOString().split('T')[0] };
}

function getFiveWeekRange() {
  const now = new Date();
  const from = new Date(now); from.setDate(now.getDate() + 1);
  const to = new Date(now); to.setDate(now.getDate() + 35);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

function filterLeaveByRange(changes, from, to) {
  return changes.filter(c => c.startDate <= to && c.endDate >= from);
}

app.get('/api/leave', async (req, res) => {
  try {
    const since = new Date(); since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().replace(/\.\d+Z$/, '+00:00');
    const url = `https://api.hibob.com/v1/timeoff/requests/changes?since=${encodeURIComponent(sinceStr)}`;
    const data = await hibobRequest(url);
    const allLeave = (data.changes || [])
      .filter(c => c.changeType !== 'Deleted' && c.status !== 'declined')
      .filter(c => c.employeeEmail !== MY_EMAIL);

    const week = getWeekRange();
    const forecast = getFiveWeekRange();
    const thisWeek = filterLeaveByRange(allLeave, week.from, week.to);
    const thisWeekIds = new Set(thisWeek.map(l => l.requestId));
    const upcoming = filterLeaveByRange(allLeave, forecast.from, forecast.to)
      .filter(l => !thisWeekIds.has(l.requestId));

    res.json({ thisWeek, upcoming, weekRange: week });
  } catch (err) {
    console.error('HiBob error:', err);
    res.status(500).json({ error: 'Failed to fetch leave data' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Personal Backlog running at http://localhost:${PORT}`);
});
