let members = [];
let activeMemberId = null;
let topics = [];
let priorities = [];
let bhags = [];
let editingBhagId = null;
let editingTopicId = null;
let selectedAddedBy = 'rhys';
let selectedEmoji = '🎯';
let selectedPriorityType = 'priority';

const EMOJIS = ['🎯','🚀','⭐','💡','🏆','🌟','💪','🔥','🎉','✨','🌈','💎','🦁','🦅','🌍','📈','🎓','🏅','💰','🤝','🧠','❤️','🌱','⚡','🎸','🏄','🧗','🎨','📚','🔬','🛠️','🌺','🦋','🐉','🏔️','🌊','🎭','🎪','🎠','🎡'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHeaderDate() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTopicDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function getViewMode() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view && view !== 'rhys') return view;
  return 'rhys';
}

// ── Member Bar ────────────────────────────────────────────────────────────────

function renderMemberBar() {
  const bar = document.getElementById('memberBar');
  bar.innerHTML = '';
  const viewMode = getViewMode();

  if (viewMode !== 'rhys') {
    bar.style.display = 'none';
    return;
  }

  members.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'member-tab' + (m.id === activeMemberId ? ' active' : '');
    btn.innerHTML = `
      ${m.photo ? `<img src="${m.photo}" alt="${m.name}" />` : `<div class="initials">${m.name[0]}</div>`}
      ${m.name}
    `;
    btn.addEventListener('click', () => selectMember(m.id));
    bar.appendChild(btn);
  });
}

async function selectMember(id) {
  activeMemberId = id;
  renderMemberBar();
  await loadBoard(id);
  renderBoard();
}

// ── Board ─────────────────────────────────────────────────────────────────────

async function loadBoard(memberId) {
  [topics, priorities, bhags] = await Promise.all([
    api('GET', `/api/boards/${memberId}/topics`),
    api('GET', `/api/boards/${memberId}/priorities`),
    api('GET', `/api/boards/${memberId}/bhags`),
  ]);
}

function renderBoard() {
  const main = document.getElementById('mainContent');
  const member = members.find(m => m.id === activeMemberId);
  if (!member) return;

  const viewMode = getViewMode();
  const memberName = member.name;

  const pendingTopics = topics.filter(t => !t.completedAt);
  const completedTopics = topics.filter(t => t.completedAt)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const activePriorities = priorities.filter(p => !p.resolvedAt && p.type === 'priority');
  const activeBlockers = priorities.filter(p => !p.resolvedAt && p.type === 'blocker');
  const resolvedItems = priorities.filter(p => p.resolvedAt)
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
  const activeGoals = bhags.filter(b => !b.achieved);
  const achievedGoals = bhags.filter(b => b.achieved);

  main.innerHTML = '';

  // Member view header (non-rhys)
  if (viewMode !== 'rhys') {
    const mh = document.createElement('div');
    mh.className = 'member-view-header';
    mh.innerHTML = `
      ${member.photo ? `<img src="${member.photo}" alt="${member.name}" />` : ''}
      <div>
        <div class="member-view-name">${member.name}</div>
        <div class="member-view-sub">Your 1:1 board with Rhys</div>
      </div>
    `;
    main.appendChild(mh);
  }

  const layout = document.createElement('div');
  layout.style.cssText = 'display:contents';

  // Topics Panel
  const topicsPanel = document.createElement('div');
  topicsPanel.className = 'panel';
  topicsPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">💬 Discussion Topics</div>
      <button class="btn-add" id="addTopicBtn">+ Add Topic</button>
    </div>
    <div class="topics-list" id="topicsList"></div>
  `;

  const topicsList = topicsPanel.querySelector('#topicsList');

  if (pendingTopics.length === 0 && completedTopics.length === 0) {
    topicsList.innerHTML = `<div class="panel-empty">No topics yet — add something to discuss!</div>`;
  } else {
    if (pendingTopics.length > 0) {
      pendingTopics.forEach(t => topicsList.appendChild(buildTopicRow(t, memberName)));
    } else {
      topicsList.innerHTML += `<div class="panel-empty" style="padding:16px 20px">No pending topics 🎉</div>`;
    }

    if (completedTopics.length > 0) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      div.textContent = 'Discussed';
      topicsList.appendChild(div);
      completedTopics.forEach(t => topicsList.appendChild(buildTopicRow(t, memberName)));
    }
  }

  topicsPanel.querySelector('#addTopicBtn').addEventListener('click', openAddTopic);

  // Priorities & Blockers Panel
  const prioritiesPanel = document.createElement('div');
  prioritiesPanel.className = 'panel';
  prioritiesPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">📌 Current Priorities</div>
      <button class="btn-add" id="addPriorityBtn">+ Add</button>
    </div>
    <div class="priorities-list" id="prioritiesList"></div>
  `;

  const prioritiesList = prioritiesPanel.querySelector('#prioritiesList');

  if (activePriorities.length === 0 && activeBlockers.length === 0 && resolvedItems.length === 0) {
    prioritiesList.innerHTML = `<div class="panel-empty">No priorities yet — add a work stream or blocker!</div>`;
  } else {
    if (activePriorities.length > 0) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      div.textContent = 'Work Streams';
      prioritiesList.appendChild(div);
      activePriorities.forEach(p => prioritiesList.appendChild(buildPriorityRow(p)));
    }
    if (activeBlockers.length > 0) {
      const div = document.createElement('div');
      div.className = 'section-divider blocker-divider';
      div.textContent = '⛔ Blockers';
      prioritiesList.appendChild(div);
      activeBlockers.forEach(p => prioritiesList.appendChild(buildPriorityRow(p)));
    }
    if (resolvedItems.length > 0) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      div.textContent = 'Resolved';
      prioritiesList.appendChild(div);
      resolvedItems.forEach(p => prioritiesList.appendChild(buildPriorityRow(p)));
    }
  }

  prioritiesPanel.querySelector('#addPriorityBtn').addEventListener('click', openAddPriority);

  // BHAGs Panel
  const bhagsPanel = document.createElement('div');
  bhagsPanel.className = 'panel';
  bhagsPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">🚀 BHAGs</div>
      <button class="btn-add" id="addBhagBtn">+ Add Goal</button>
    </div>
    <div class="bhags-list" id="bhagsList"></div>
  `;

  const bhagsList = bhagsPanel.querySelector('#bhagsList');

  if (activeGoals.length === 0 && achievedGoals.length === 0) {
    bhagsList.innerHTML = `<div class="panel-empty">No goals yet — dream big!</div>`;
  } else {
    activeGoals.forEach(b => bhagsList.appendChild(buildBhagCard(b)));
    if (achievedGoals.length > 0) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      div.textContent = 'Achieved';
      bhagsList.appendChild(div);
      achievedGoals.forEach(b => bhagsList.appendChild(buildBhagCard(b)));
    }
  }

  bhagsPanel.querySelector('#addBhagBtn').addEventListener('click', openAddBhag);

  main.appendChild(topicsPanel);
  main.appendChild(bhagsPanel);
  main.appendChild(prioritiesPanel);
}

function buildTopicRow(topic, memberName) {
  const row = document.createElement('div');
  row.className = 'topic-row' + (topic.completedAt ? ' completed' : '');

  const byLabel = topic.addedBy === 'rhys' ? 'Rhys' : memberName;
  const byCls = topic.addedBy === 'rhys' ? 'rhys' : 'member';

  row.innerHTML = `
    <button class="topic-check ${topic.completedAt ? 'done' : ''}"></button>
    <div class="topic-content">
      <div class="topic-title">${topic.text}</div>
      ${topic.description ? `<div class="topic-desc">${topic.description}</div>` : ''}
      <div class="topic-meta">
        <span class="added-by-badge ${byCls}">${byLabel}</span>
        <span class="topic-timestamp">${formatTopicDate(topic.createdAt)}</span>
      </div>
    </div>
    <button class="topic-delete">×</button>
  `;

  row.querySelector('.topic-check').addEventListener('click', () => toggleTopic(topic.id));
  row.querySelector('.topic-delete').addEventListener('click', () => deleteTopic(topic.id));

  return row;
}

function buildPriorityRow(item) {
  const row = document.createElement('div');
  const isBlocker = item.type === 'blocker';
  const isResolved = !!item.resolvedAt;
  row.className = `priority-row${isBlocker ? ' blocker' : ''}${isResolved ? ' resolved' : ''}`;
  row.innerHTML = `
    <button class="topic-check ${isResolved ? 'done' : ''}"></button>
    <div class="topic-content">
      <div class="topic-title">${item.text}</div>
      ${item.description ? `<div class="topic-desc">${item.description}</div>` : ''}
      <div class="topic-meta">
        <span class="topic-timestamp">${formatTopicDate(item.createdAt)}</span>
      </div>
    </div>
    <button class="topic-delete">×</button>
  `;
  row.querySelector('.topic-check').addEventListener('click', () => togglePriority(item.id));
  row.querySelector('.topic-delete').addEventListener('click', () => deletePriority(item.id));
  return row;
}

function buildBhagCard(bhag) {
  const card = document.createElement('div');
  card.className = 'bhag-card' + (bhag.achieved ? ' achieved' : '');
  card.innerHTML = `
    <div class="bhag-top">
      <div class="bhag-emoji">${bhag.emoji}</div>
      <div class="bhag-body">
        <div class="bhag-title">${bhag.title}</div>
        ${bhag.description ? `<div class="bhag-desc">${bhag.description}</div>` : ''}
      </div>
    </div>
    <div class="bhag-actions">
      <button class="btn-achieve ${bhag.achieved ? 'achieved' : ''}">${bhag.achieved ? '✓ Achieved' : 'Mark Achieved'}</button>
      <button class="btn-edit-bhag">✏️</button>
      <button class="btn-delete-bhag">×</button>
    </div>
  `;

  card.querySelector('.btn-achieve').addEventListener('click', () => toggleBhag(bhag.id));
  card.querySelector('.btn-edit-bhag').addEventListener('click', () => openEditBhag(bhag.id));
  card.querySelector('.btn-delete-bhag').addEventListener('click', () => deleteBhag(bhag.id));

  return card;
}

// ── Topic Actions ─────────────────────────────────────────────────────────────

async function toggleTopic(id) {
  const topic = topics.find(t => t.id === id);
  if (!topic) return;
  const completedAt = topic.completedAt ? null : new Date().toISOString();
  const updated = await api('PATCH', `/api/boards/${activeMemberId}/topics/${id}`, { completedAt });
  topics = topics.map(t => t.id === id ? updated : t);
  renderBoard();
}

async function deleteTopic(id) {
  await api('DELETE', `/api/boards/${activeMemberId}/topics/${id}`);
  topics = topics.filter(t => t.id !== id);
  renderBoard();
}

// ── Priority Actions ──────────────────────────────────────────────────────────

async function togglePriority(id) {
  const item = priorities.find(p => p.id === id);
  if (!item) return;
  const resolvedAt = item.resolvedAt ? null : new Date().toISOString();
  const updated = await api('PATCH', `/api/boards/${activeMemberId}/priorities/${id}`, { resolvedAt });
  priorities = priorities.map(p => p.id === id ? updated : p);
  renderBoard();
}

async function deletePriority(id) {
  await api('DELETE', `/api/boards/${activeMemberId}/priorities/${id}`);
  priorities = priorities.filter(p => p.id !== id);
  renderBoard();
}

// ── BHAG Actions ──────────────────────────────────────────────────────────────

async function toggleBhag(id) {
  const bhag = bhags.find(b => b.id === id);
  if (!bhag) return;
  const updated = await api('PATCH', `/api/boards/${activeMemberId}/bhags/${id}`, { achieved: !bhag.achieved });
  bhags = bhags.map(b => b.id === id ? updated : b);
  renderBoard();
}

async function deleteBhag(id) {
  await api('DELETE', `/api/boards/${activeMemberId}/bhags/${id}`);
  bhags = bhags.filter(b => b.id !== id);
  renderBoard();
}

// ── Topic Modal ───────────────────────────────────────────────────────────────

function openAddTopic() {
  editingTopicId = null;
  selectedAddedBy = 'rhys';
  document.getElementById('topicModalTitle').textContent = 'Add Topic';
  document.getElementById('topicText').value = '';
  document.getElementById('topicDescription').value = '';
  const member = members.find(m => m.id === activeMemberId);
  document.getElementById('addedByMemberBtn').textContent = member?.name || 'Team Member';
  document.querySelectorAll('.addedby-btn').forEach(b => b.classList.toggle('active', b.dataset.by === 'rhys'));
  document.getElementById('topicModal').classList.add('open');
  setTimeout(() => document.getElementById('topicText').focus(), 100);
}

document.querySelectorAll('.addedby-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedAddedBy = btn.dataset.by;
    document.querySelectorAll('.addedby-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('topicCancel').addEventListener('click', () => {
  document.getElementById('topicModal').classList.remove('open');
});

document.getElementById('topicSave').addEventListener('click', async () => {
  const text = document.getElementById('topicText').value.trim();
  if (!text) return;
  const description = document.getElementById('topicDescription').value.trim() || null;
  const topic = await api('POST', `/api/boards/${activeMemberId}/topics`, {
    text,
    description,
    addedBy: selectedAddedBy,
  });
  topics.push(topic);
  document.getElementById('topicModal').classList.remove('open');
  renderBoard();
});

document.getElementById('topicText').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.metaKey) document.getElementById('topicSave').click();
});

// ── Priority Modal ────────────────────────────────────────────────────────────

function openAddPriority() {
  selectedPriorityType = 'priority';
  document.getElementById('priorityModalTitle').textContent = 'Add Priority or Blocker';
  document.getElementById('priorityText').value = '';
  document.getElementById('priorityDescription').value = '';
  document.querySelectorAll('.priority-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === 'priority');
  });
  document.getElementById('priorityModal').classList.add('open');
  setTimeout(() => document.getElementById('priorityText').focus(), 100);
}

document.querySelectorAll('.priority-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedPriorityType = btn.dataset.type;
    document.querySelectorAll('.priority-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('priorityCancel').addEventListener('click', () => {
  document.getElementById('priorityModal').classList.remove('open');
});

document.getElementById('prioritySave').addEventListener('click', async () => {
  const text = document.getElementById('priorityText').value.trim();
  if (!text) return;
  const description = document.getElementById('priorityDescription').value.trim() || null;
  const item = await api('POST', `/api/boards/${activeMemberId}/priorities`, {
    text,
    description,
    type: selectedPriorityType,
  });
  priorities.push(item);
  document.getElementById('priorityModal').classList.remove('open');
  renderBoard();
});

document.getElementById('priorityText').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('prioritySave').click();
});

// ── BHAG Modal ────────────────────────────────────────────────────────────────

function buildEmojiPicker(selected) {
  const picker = document.getElementById('emojiPicker');
  picker.innerHTML = '';
  EMOJIS.forEach(e => {
    const span = document.createElement('span');
    span.className = 'emoji-option' + (e === selected ? ' selected' : '');
    span.textContent = e;
    span.addEventListener('click', () => {
      selectedEmoji = e;
      document.getElementById('bhagEmoji').value = e;
      picker.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
      span.classList.add('selected');
    });
    picker.appendChild(span);
  });
}

function openAddBhag() {
  editingBhagId = null;
  selectedEmoji = '🎯';
  document.getElementById('bhagModalTitle').textContent = 'Add BHAG';
  document.getElementById('bhagTitle').value = '';
  document.getElementById('bhagDescription').value = '';
  document.getElementById('bhagEmoji').value = '🎯';
  buildEmojiPicker('🎯');
  document.getElementById('bhagModal').classList.add('open');
  setTimeout(() => document.getElementById('bhagTitle').focus(), 100);
}

function openEditBhag(id) {
  const bhag = bhags.find(b => b.id === id);
  if (!bhag) return;
  editingBhagId = id;
  selectedEmoji = bhag.emoji;
  document.getElementById('bhagModalTitle').textContent = 'Edit BHAG';
  document.getElementById('bhagTitle').value = bhag.title;
  document.getElementById('bhagDescription').value = bhag.description || '';
  document.getElementById('bhagEmoji').value = bhag.emoji;
  buildEmojiPicker(bhag.emoji);
  document.getElementById('bhagModal').classList.add('open');
  setTimeout(() => document.getElementById('bhagTitle').focus(), 100);
}

document.getElementById('bhagCancel').addEventListener('click', () => {
  document.getElementById('bhagModal').classList.remove('open');
});

document.getElementById('bhagSave').addEventListener('click', async () => {
  const title = document.getElementById('bhagTitle').value.trim();
  if (!title) return;
  const description = document.getElementById('bhagDescription').value.trim() || null;
  const emoji = selectedEmoji;

  if (editingBhagId) {
    const updated = await api('PATCH', `/api/boards/${activeMemberId}/bhags/${editingBhagId}`, { title, description, emoji });
    bhags = bhags.map(b => b.id === editingBhagId ? updated : b);
  } else {
    const bhag = await api('POST', `/api/boards/${activeMemberId}/bhags`, { title, description, emoji });
    bhags.push(bhag);
  }

  document.getElementById('bhagModal').classList.remove('open');
  renderBoard();
});

document.getElementById('bhagTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('bhagSave').click();
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('dateLabel').textContent = formatHeaderDate();

  members = await api('GET', '/api/members');

  const viewMode = getViewMode();

  if (viewMode !== 'rhys') {
    const member = members.find(m => m.id === viewMode);
    if (!member) {
      document.getElementById('mainContent').innerHTML = `<div style="padding:40px;color:#888">Board not found.</div>`;
      return;
    }
    activeMemberId = member.id;
    document.getElementById('memberBar').style.display = 'none';
    // Update "Added by" button label
    document.getElementById('addedByMemberBtn').textContent = member.name;
  } else {
    activeMemberId = members[0]?.id;
    renderMemberBar();
  }

  if (activeMemberId) {
    await loadBoard(activeMemberId);
    renderBoard();
  }
}

init();
