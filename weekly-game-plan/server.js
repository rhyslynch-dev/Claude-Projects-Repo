const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'data', 'weeks.json');
const PORT = process.env.PORT || 3000;

const MEMBERS = [
  { id: 'rhys',   name: 'Rhys Lynch',     initials: 'RL', color: '#4F86C6' },
  { id: 'nate',   name: 'Nate Smithen',   initials: 'NS', color: '#E07BB5' },
  { id: 'david',  name: 'David Rossiter', initials: 'DR', color: '#9B59B6' },
  { id: 'rowena', name: 'Rowena Ramsay',  initials: 'RR', color: '#E67E22' },
  { id: 'arslan', name: 'Arslan Nasir',   initials: 'AN', color: '#27AE60' },
];

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { weeks: {} };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { weeks: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function createWeek(weekKey, prevWeekKey, allData) {
  const members = {};
  for (const m of MEMBERS) {
    const prevGoal = prevWeekKey && allData.weeks[prevWeekKey]
      ? allData.weeks[prevWeekKey].members[m.id]?.goal || ''
      : '';
    members[m.id] = {
      goal: '',
      toAchieve: '',
      lastWeekGoal: prevGoal,
      outcomeStatus: null,
    };
  }
  return { weekKey, members, kudos: [] };
}

function getOrCreateWeek(weekKey) {
  const data = loadData();
  if (!data.weeks[weekKey]) {
    const keys = Object.keys(data.weeks).sort();
    const prevKey = keys.length ? keys[keys.length - 1] : null;
    data.weeks[weekKey] = createWeek(weekKey, prevKey, data);
    saveData(data);
  }
  return data.weeks[weekKey];
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/members', (req, res) => res.json(MEMBERS));

app.get('/api/week/:key', (req, res) => {
  const week = getOrCreateWeek(req.params.key);
  res.json(week);
});

app.get('/api/history', (req, res) => {
  const data = loadData();
  const keys = Object.keys(data.weeks).sort().reverse();
  res.json(keys.map(k => ({ weekKey: k, week: data.weeks[k] })));
});

io.on('connection', (socket) => {
  socket.on('join-week', (weekKey) => {
    socket.join(weekKey);
    const week = getOrCreateWeek(weekKey);
    socket.emit('week-state', week);
  });

  socket.on('update-field', ({ weekKey, memberId, field, value }) => {
    const data = loadData();
    if (!data.weeks[weekKey]) return;
    if (!['goal', 'toAchieve', 'outcomeStatus'].includes(field)) return;
    data.weeks[weekKey].members[memberId][field] = value;
    saveData(data);
    io.to(weekKey).emit('field-updated', { memberId, field, value });
  });

  socket.on('add-kudos', ({ weekKey, from, to, message }) => {
    if (!message?.trim()) return;
    const data = loadData();
    if (!data.weeks[weekKey]) return;
    const kudo = { id: Date.now(), from, to, message: message.trim(), timestamp: new Date().toISOString() };
    data.weeks[weekKey].kudos.push(kudo);
    saveData(data);
    io.to(weekKey).emit('kudos-added', kudo);
  });

  socket.on('start-new-week', () => {
    const weekKey = getWeekKey();
    const week = getOrCreateWeek(weekKey);
    io.emit('week-changed', { weekKey, week });
  });
});

server.listen(PORT, () => {
  console.log(`Weekly Game Plan running at http://localhost:${PORT}`);
});
