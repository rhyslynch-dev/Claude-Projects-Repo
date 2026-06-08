const socket = io();

let members = [];
let currentWeekKey = null;
let currentWeek = null;

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function formatWeekLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const monday = new Date(y, m - 1, d);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const opts = { day: 'numeric', month: 'short' };
  return `w/c ${monday.toLocaleDateString('en-GB', opts)} – ${friday.toLocaleDateString('en-GB', opts)}`;
}

function getMember(id) {
  return members.find(m => m.id === id);
}

// ── Build board ──────────────────────────────────────────────────────────────

function buildBoard(week) {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (const m of members) {
    const mData = week.members[m.id] || {};
    board.appendChild(buildCard(m, mData, week.kudos || []));
  }
}

function buildCard(m, mData, kudos) {
  const memberKudos = kudos.filter(k => k.to === m.id);

  const card = document.createElement('div');
  card.className = 'member-card';
  card.dataset.member = m.id;

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <div class="avatar" style="background:${m.color}">${m.initials}</div>
    <div class="member-name">${m.name}</div>
  `;
  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  // This week goal
  body.appendChild(buildField('GOAL OF THE WEEK', 'goal', m.id, mData.goal || '', 'What is your key goal this week?'));

  // To achieve
  body.appendChild(buildField('TO ACHIEVE THIS I NEED', 'toAchieve', m.id, mData.toAchieve || '', 'What do you need to make it happen?'));

  // Last week reflection
  body.appendChild(buildOutcomeSection(m.id, mData));

  card.appendChild(body);

  // Kudos
  card.appendChild(buildKudosSection(m, memberKudos));

  return card;
}

function buildField(label, field, memberId, value, placeholder) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="section-label">${label}</div>`;

  const ta = document.createElement('textarea');
  ta.placeholder = placeholder;
  ta.value = value;
  ta.dataset.field = field;
  ta.dataset.member = memberId;

  let debounce;
  ta.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      socket.emit('update-field', {
        weekKey: currentWeekKey,
        memberId,
        field,
        value: ta.value,
      });
    }, 400);
  });

  wrap.appendChild(ta);
  return wrap;
}

function buildOutcomeSection(memberId, mData) {
  const wrap = document.createElement('div');
  wrap.className = 'outcome-section';

  const lastGoal = mData.lastWeekGoal || '';
  const goalText = document.createElement('div');
  goalText.className = 'last-goal-text' + (lastGoal ? '' : ' empty');
  goalText.textContent = lastGoal || 'No goal recorded last week';
  wrap.appendChild(goalText);

  const label = document.createElement('div');
  label.className = 'section-label';
  label.style.marginBottom = '8px';
  label.textContent = 'LAST WEEK OUTCOME';
  wrap.insertBefore(label, goalText);

  const btns = document.createElement('div');
  btns.className = 'outcome-btns';

  const statuses = [
    { key: 'achieved', label: '✓ Achieved' },
    { key: 'partial',  label: '~ Partial'  },
    { key: 'missed',   label: '✗ Missed'   },
  ];

  for (const s of statuses) {
    const btn = document.createElement('button');
    btn.className = 'outcome-btn';
    btn.textContent = s.label;
    btn.dataset.status = s.key;
    if (mData.outcomeStatus === s.key) btn.classList.add(`active-${s.key}`);

    btn.addEventListener('click', () => {
      const newVal = mData.outcomeStatus === s.key ? null : s.key;
      socket.emit('update-field', {
        weekKey: currentWeekKey,
        memberId,
        field: 'outcomeStatus',
        value: newVal,
      });
    });
    btns.appendChild(btn);
  }
  wrap.appendChild(btns);
  return wrap;
}

function buildKudosSection(m, memberKudos) {
  const section = document.createElement('div');
  section.className = 'kudos-section';

  const header = document.createElement('div');
  header.className = 'kudos-header';
  header.innerHTML = `<div class="section-label" style="margin:0">KUDOS 🙌</div>`;

  const giveBtn = document.createElement('button');
  giveBtn.className = 'btn-give-kudos';
  giveBtn.textContent = '+ Give Kudos';
  giveBtn.addEventListener('click', () => openKudosModal(m.id));
  header.appendChild(giveBtn);
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'kudos-list';
  list.dataset.kudosList = m.id;

  if (memberKudos.length === 0) {
    list.innerHTML = '<div class="kudos-empty">No kudos yet this week</div>';
  } else {
    for (const k of memberKudos) renderKudo(list, k);
  }

  section.appendChild(list);
  return section;
}

function renderKudo(list, kudo) {
  // Remove empty state if present
  const empty = list.querySelector('.kudos-empty');
  if (empty) empty.remove();

  const fromMember = getMember(kudo.from);
  const chip = document.createElement('div');
  chip.className = 'kudo-chip';
  chip.dataset.kudoId = kudo.id;
  chip.innerHTML = `
    <div>"${kudo.message}"</div>
    <div class="kudo-from">— ${fromMember ? fromMember.name : kudo.from}</div>
  `;
  list.appendChild(chip);
}

// ── Patch updates (no full re-render) ────────────────────────────────────────

function patchField(memberId, field, value) {
  if (!currentWeek) return;
  currentWeek.members[memberId][field] = value;

  const card = document.querySelector(`.member-card[data-member="${memberId}"]`);
  if (!card) return;

  if (field === 'goal' || field === 'toAchieve') {
    const ta = card.querySelector(`textarea[data-field="${field}"]`);
    if (ta && document.activeElement !== ta) ta.value = value;
  }

  if (field === 'outcomeStatus') {
    const btns = card.querySelectorAll('.outcome-btn');
    btns.forEach(btn => {
      btn.className = 'outcome-btn';
      if (btn.dataset.status === value) btn.classList.add(`active-${value}`);
    });
  }
}

function patchKudo(kudo) {
  if (!currentWeek) return;
  currentWeek.kudos.push(kudo);
  const list = document.querySelector(`[data-kudos-list="${kudo.to}"]`);
  if (list) renderKudo(list, kudo);
}

// ── Kudos Modal ──────────────────────────────────────────────────────────────

function openKudosModal(preselectedTo = null) {
  const modal = document.getElementById('kudosModal');
  const fromSel = document.getElementById('kudosFrom');
  const toSel = document.getElementById('kudosTo');
  const msg = document.getElementById('kudosMessage');

  fromSel.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  toSel.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

  if (preselectedTo) toSel.value = preselectedTo;
  msg.value = '';
  modal.classList.add('open');
}

document.getElementById('kudosCancel').addEventListener('click', () => {
  document.getElementById('kudosModal').classList.remove('open');
});

document.getElementById('kudosSend').addEventListener('click', () => {
  const from = document.getElementById('kudosFrom').value;
  const to = document.getElementById('kudosTo').value;
  const message = document.getElementById('kudosMessage').value;
  if (!message.trim()) return;
  socket.emit('add-kudos', { weekKey: currentWeekKey, from, to, message });
  document.getElementById('kudosModal').classList.remove('open');
});

// ── History Modal ────────────────────────────────────────────────────────────

document.getElementById('historyBtn').addEventListener('click', async () => {
  const modal = document.getElementById('historyModal');
  const content = document.getElementById('historyContent');
  content.innerHTML = 'Loading...';
  modal.classList.add('open');

  const res = await fetch('/api/history');
  const history = await res.json();

  if (history.length === 0) {
    content.innerHTML = '<p style="color:var(--text-muted)">No history yet.</p>';
    return;
  }

  content.innerHTML = history.map(({ weekKey, week }) => {
    const memberCards = members.map(m => {
      const mData = week.members[m.id] || {};
      const statusClass = mData.outcomeStatus || 'pending';
      const statusLabel = mData.outcomeStatus
        ? mData.outcomeStatus.charAt(0).toUpperCase() + mData.outcomeStatus.slice(1)
        : 'Pending';
      return `
        <div class="history-member-card">
          <div class="h-name">${m.name}</div>
          <div class="h-goal">${mData.goal || '<em>No goal set</em>'}</div>
          <span class="h-status ${statusClass}">${statusLabel}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="history-week">
        <h3>${formatWeekLabel(weekKey)}</h3>
        <div class="history-grid">${memberCards}</div>
      </div>
    `;
  }).join('');
});

document.getElementById('historyClose').addEventListener('click', () => {
  document.getElementById('historyModal').classList.remove('open');
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── New Week ─────────────────────────────────────────────────────────────────

document.getElementById('newWeekBtn').addEventListener('click', () => {
  if (!confirm('Start a new week? This will carry over this week\'s goals as last week\'s goals for reflection.')) return;
  socket.emit('start-new-week');
});

// ── Socket events ────────────────────────────────────────────────────────────

socket.on('week-state', (week) => {
  currentWeek = week;
  buildBoard(week);
});

socket.on('field-updated', ({ memberId, field, value }) => {
  patchField(memberId, field, value);
});

socket.on('kudos-added', (kudo) => {
  patchKudo(kudo);
});

socket.on('week-changed', ({ weekKey, week }) => {
  currentWeekKey = weekKey;
  currentWeek = week;
  document.getElementById('weekLabel').innerHTML = `<span class="live-dot"></span>${formatWeekLabel(weekKey)}`;
  buildBoard(week);
});

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch('/api/members');
  members = await res.json();

  currentWeekKey = getWeekKey();
  document.getElementById('weekLabel').innerHTML =
    `<span class="live-dot"></span>${formatWeekLabel(currentWeekKey)}`;

  socket.emit('join-week', currentWeekKey);
}

init();
