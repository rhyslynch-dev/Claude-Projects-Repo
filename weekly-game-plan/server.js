const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
const HIBOB_CONFIGURED = Boolean(HIBOB_SERVICE_ID && HIBOB_TOKEN);

if (!HIBOB_CONFIGURED) {
  console.warn(
    '⚠️  HIBOB_SERVICE_ID and/or HIBOB_TOKEN are not set. The Team Leave panel\n' +
    '    will show "no leave booked" rather than an error, which is\n' +
    '    indistinguishable from a genuinely empty week. Set both to enable it.\n' +
    '    In Azure these belong in Configuration → Application settings.'
  );
}

// TLS certificate validation stays ON by default. It only needs disabling on
// networks that intercept HTTPS with a self-signed root (e.g. the Bulk office
// proxy, which breaks the HiBob call with SELF_SIGNED_CERT_IN_CHAIN).
// Do NOT set this in a hosted environment such as Azure.
const HIBOB_INSECURE_TLS = process.env.HIBOB_INSECURE_TLS === 'true';
if (HIBOB_INSECURE_TLS) {
  console.warn('⚠️  HIBOB_INSECURE_TLS=true — TLS certificate validation is DISABLED for HiBob requests.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'data', 'weeks.json');
const PORT = process.env.PORT || 3000;

const MEMBERS = [
  { id: 'rhys',   name: 'Rhys Lynch',     initials: 'RL', color: '#4F86C6', photo: '/images/Rhys.png'   },
  { id: 'nate',   name: 'Nathaniel Smithen',   initials: 'NS', color: '#E07BB5', photo: '/images/Nate.png'   },
  { id: 'david',  name: 'David Rossiter', initials: 'DR', color: '#9B59B6', photo: '/images/David.png'  },
  { id: 'rowena', name: 'Rowena Ramsay',  initials: 'RR', color: '#E67E22', photo: '/images/Row.png'    },
  { id: 'arslan', name: 'Arslan Nasir',   initials: 'AN', color: '#27AE60', photo: '/images/Arslan.jpg' },
  { id: 'megan',  name: 'Megan Wharton', initials: 'MW', color: '#E74C3C', photo: '/images/Megan.jpg'  },
  { id: 'sumit',  name: 'Sumit Ingle',   initials: 'SI', color: '#1ABC9C', photo: '/images/Sumit-Ingle.jpg' },
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
  const keys = Object.keys(data.weeks).sort();

  if (!data.weeks[weekKey]) {
    const prevKey = keys.length ? keys[keys.length - 1] : null;
    data.weeks[weekKey] = createWeek(weekKey, prevKey, data);
    saveData(data);
    return data.weeks[weekKey];
  }

  // Backfill members added to MEMBERS after this week was created. Without
  // this, update-field writes to members[id] === undefined and throws,
  // which crashes the process for everyone.
  const week = data.weeks[weekKey];
  const prevKey = keys.filter(k => k < weekKey).pop() || null;
  let added = false;
  for (const m of MEMBERS) {
    if (!week.members[m.id]) {
      week.members[m.id] = {
        goal: '',
        toAchieve: '',
        lastWeekGoal: prevKey ? (data.weeks[prevKey].members[m.id]?.goal || '') : '',
        outcomeStatus: null,
      };
      added = true;
    }
  }
  if (added) saveData(data);
  return week;
}

app.use(express.static(path.join(__dirname, 'public')));

// ── HiBob Leave API ───────────────────────────────────────────────────────────

function hibobRequest(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${HIBOB_AUTH}`,
        'Accept': 'application/json',
      },
      rejectUnauthorized: !HIBOB_INSECURE_TLS,
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllLeave() {
  const since = new Date();
  since.setDate(since.getDate() - 200); // go back 200 days to catch leave booked well in advance
  const sinceStr = since.toISOString().replace(/\.\d+Z$/, '+00:00');
  const url = `https://api.hibob.com/v1/timeoff/requests/changes?since=${encodeURIComponent(sinceStr)}`;
  const data = await hibobRequest(url);
  return (data.changes || []).filter(c => !['Deleted', 'Canceled'].includes(c.changeType) && c.status !== 'declined');
}

function filterLeaveByRange(changes, from, to) {
  return changes.filter(c => c.startDate <= to && c.endDate >= from);
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    from: monday.toISOString().split('T')[0],
    to: friday.toISOString().split('T')[0],
  };
}

function getFiveWeekRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() + 1); // start from tomorrow
  const to = new Date(now);
  to.setDate(now.getDate() + 70); // 10 weeks ahead
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

app.get('/api/leave', async (req, res) => {
  // Fail loudly rather than returning an empty result set, which the UI would
  // render as "no leave booked" — indistinguishable from a quiet week.
  if (!HIBOB_CONFIGURED) {
    return res.status(503).json({ error: 'HiBob credentials not configured' });
  }
  try {
    const week     = getWeekRange();
    const forecast = getFiveWeekRange();

    const allLeave = await fetchAllLeave();

    const thisWeek    = filterLeaveByRange(allLeave, week.from, week.to);
    const thisWeekIds = new Set(thisWeek.map(l => l.requestId));
    const upcoming    = filterLeaveByRange(allLeave, forecast.from, forecast.to)
      .filter(l => !thisWeekIds.has(l.requestId));

    res.json({ thisWeek, thisMonth: upcoming, weekRange: week, monthRange: forecast });
  } catch (err) {
    console.error('HiBob error:', err);
    res.status(500).json({ error: 'Failed to fetch leave data' });
  }
});

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
    if (!data.weeks[weekKey].members[memberId]) {
      console.warn(`update-field: unknown member "${memberId}" in week ${weekKey} — ignoring`);
      return;
    }
    data.weeks[weekKey].members[memberId][field] = value;
    saveData(data);
    io.to(weekKey).emit('field-updated', { memberId, field, value });
  });

  socket.on('add-kudos', ({ weekKey, from, to, message }) => {
    if (!message?.trim()) return;
    const data = loadData();
    if (!data.weeks[weekKey]) return;
    const kudo = { id: Date.now(), from, to, message: message.trim(), timestamp: new Date().toISOString(), upvotes: [] };
    data.weeks[weekKey].kudos.push(kudo);
    saveData(data);
    io.to(weekKey).emit('kudos-added', kudo);
  });

  socket.on('upvote-kudos', ({ weekKey, kudoId, memberId }) => {
    const data = loadData();
    if (!data.weeks[weekKey]) return;
    const kudo = data.weeks[weekKey].kudos.find(k => k.id === kudoId);
    if (!kudo) return;
    if (!kudo.upvotes) kudo.upvotes = [];
    const idx = kudo.upvotes.indexOf(memberId);
    if (idx === -1) {
      kudo.upvotes.push(memberId);
    } else {
      kudo.upvotes.splice(idx, 1); // toggle off
    }
    saveData(data);
    io.to(weekKey).emit('kudos-upvoted', { kudoId, upvotes: kudo.upvotes });
  });

  socket.on('start-new-week', () => {
    const data = loadData();
    const weekKey = getWeekKey();

    // Find the most recent completed week to carry goals forward
    const keys = Object.keys(data.weeks).sort();
    const prevKey = keys.filter(k => k !== weekKey).pop();
    const prevWeek = prevKey ? data.weeks[prevKey] : null;

    // Always create a fresh week — clear all fields, carry last week's goals
    const members = {};
    for (const m of MEMBERS) {
      const lastGoal = prevWeek ? (prevWeek.members[m.id]?.goal || '') : '';
      members[m.id] = {
        goal: '',
        toAchieve: '',
        lastWeekGoal: lastGoal,
        outcomeStatus: null,
      };
    }
    data.weeks[weekKey] = { weekKey, members, kudos: [] };
    saveData(data);

    io.emit('week-changed', { weekKey, week: data.weeks[weekKey] });
  });
});

server.listen(PORT, () => {
  console.log(`Weekly Game Plan running at http://localhost:${PORT}`);
});
